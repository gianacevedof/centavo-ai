// services/budgetOverview.js
// The budget page: each budget with this month's spending, plus short AI tips.
// Every number is calculated here. The AI only writes wording, and its reply is
// checked so it can only use numbers that appear in the facts we sent.
import pool from "../db.js";
import { generateBudgetTips } from "./gemini.js";
import { getCached, setCached } from "./aiCache.js";

const TIMEOUT_MS = 8000;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round(n * 100) / 100;

function monthBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start: ymd(start), end: ymd(end), label };
}

// One row per budget with this month's expense total. Transfers and savings are not spending.
export async function buildBudgetOverview(userId) {
  const { start, end, label } = monthBounds();
  const [rows] = await pool.query(
    `SELECT b.id, b.category_id, c.name AS category, b.monthly_limit,
            COALESCE(SUM(t.amount), 0) AS spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN transactions t
       ON t.category_id = b.category_id AND t.user_id = b.user_id
      AND t.type = 'expense' AND t.date >= ? AND t.date < ?
     WHERE b.user_id = ?
     GROUP BY b.id, b.category_id, c.name, b.monthly_limit
     ORDER BY c.name`,
    [start, end, userId],
  );

  const budgets = rows.map((r) => {
    const limit = Number(r.monthly_limit);
    const spent = Number(r.spent);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;
    return {
      id: Number(r.id),
      category_id: Number(r.category_id),
      category: r.category,
      monthly_limit: round2(limit),
      spent: round2(spent),
      remaining: round2(limit - spent),
      percent: Math.round(percent),
      status: percent >= 100 ? "over" : percent >= 85 ? "near" : "under",
    };
  });

  return { month: label, budgets };
}

// Every number the AI may use, written the way it should appear in a tip.
function buildFacts(overview) {
  return {
    month: overview.month,
    budgets: overview.budgets.map((b) => ({
      category: b.category,
      monthly_limit: money(b.monthly_limit),
      spent: money(b.spent),
      remaining: b.remaining < 0 ? `-${money(-b.remaining)}` : money(b.remaining),
      percent_used: `${b.percent}%`,
      status: b.status,
    })),
  };
}

const NUMBER_TOKEN = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const normalize = (s) => s.replace(/[$,]/g, "");

// Checks the AI's tips: shape, length, a real budget category, and only numbers from the facts
function checkBudgetTips(tips, facts) {
  if (!Array.isArray(tips) || tips.length < 1 || tips.length > facts.budgets.length) {
    throw new Error("AI returned the wrong number of budget tips");
  }
  const allowed = new Set((JSON.stringify(facts).match(NUMBER_TOKEN) || []).map(normalize));
  const categories = new Set(facts.budgets.map((b) => b.category));

  return tips.map((t) => {
    if (typeof t?.category !== "string" || typeof t?.title !== "string" || typeof t?.body !== "string") {
      throw new Error("AI budget tip has the wrong shape");
    }
    const title = t.title.trim();
    const body = t.body.trim();
    if (!categories.has(t.category)) throw new Error("AI tip names an unknown budget");
    if (!title || !body || title.length > 60 || body.length > 300) {
      throw new Error("AI budget tip is the wrong length");
    }
    for (const token of `${title} ${body}`.match(NUMBER_TOKEN) || []) {
      if (!allowed.has(normalize(token))) {
        throw new Error(`AI budget tip used a number not in the facts: ${token}`);
      }
    }
    return { category: t.category, title, body };
  });
}

// Plain tips for when the AI is slow or down. They use no numbers.
function staticTips(overview) {
  const tips = [];
  for (const b of overview.budgets) {
    if (b.status === "over") {
      tips.push({ category: b.category, title: `Over budget on ${b.category}`, body: "Look at this month's entries here and decide what to cut before the month ends." });
    } else if (b.status === "near") {
      tips.push({ category: b.category, title: `Close to your ${b.category} limit`, body: "Slow down on this category for the rest of the month, or move the limit if it no longer fits." });
    }
  }
  if (tips.length === 0) {
    tips.push({ category: null, title: "Keep your budgets on track", body: "Check your budget page once a week so a small overspend does not add up." });
  }
  return tips.slice(0, 3);
}

// Returns { source: "ai" | "static" | "none", tips: [{ category, title, body }] }
export async function getBudgetTips(userId) {
  const cached = getCached("budgetTips", userId);
  if (cached) return cached;

  const overview = await buildBudgetOverview(userId);
  if (overview.budgets.length === 0) return { source: "none", tips: [] };

  const facts = buildFacts(overview);
  let value;
  try {
    const raw = await Promise.race([
      generateBudgetTips(facts),
      new Promise((_, reject) => setTimeout(() => reject(new Error("AI tips timed out")), TIMEOUT_MS)),
    ]);
    value = { source: "ai", tips: checkBudgetTips(raw, facts) };
  } catch (err) {
    console.warn("Using static budget tips:", err.message);
    value = { source: "static", tips: staticTips(overview) };
  }

  // Only AI tips are cached, so a slow day is retried on the next load
  if (value.source === "ai") setCached("budgetTips", userId, value);
  return value;
}
