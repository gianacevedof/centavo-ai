import pool from "../db.js";
import { buildTrends } from "./trends.js";
import { generateTips } from "./gemini.js";

const TIMEOUT_MS = 8000; // the page shouldn't wait longer than this for AI
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map(); // userId -> { at, value }

// Shown when the AI is slow, down, or returns something we can't check
const STATIC_TIPS = [
  {
    title: "Review your biggest expense",
    body: "Look at your top spending category this month and decide whether it fits your plan.",
  },
  {
    title: "Set a limit for your top category",
    body: "A monthly budget makes it easier to notice overspending early.",
  },
  {
    title: "Save a fixed amount first",
    body: "Moving a set amount to savings right after payday builds savings without extra effort.",
  },
];

const money = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Every number the AI may mention. The AI is told to copy these, never calculate.
async function buildFacts(userId) {
  const trends = await buildTrends(userId, 6);
  const cur = trends.monthly[trends.monthly.length - 1];
  const change = trends.month_over_month[0]?.change_percent ?? null;
  const top = trends.kpis.top_category;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [budgetRows] = await pool.query(
    `SELECT c.name AS category, b.monthly_limit AS monthly_limit,
            COALESCE(SUM(t.amount), 0) AS spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN transactions t
       ON t.category_id = b.category_id AND t.user_id = b.user_id
      AND t.type = 'expense' AND t.date >= ? AND t.date < ?
     WHERE b.user_id = ?
     GROUP BY b.id, c.name, b.monthly_limit`,
    [ymd(monthStart), ymd(nextMonth), userId],
  );
  const nearLimit = budgetRows
    .map((b) => {
      const limit = Number(b.monthly_limit);
      const spent = Number(b.spent);
      return { category: b.category, limit, spent, percent: limit > 0 ? (spent / limit) * 100 : 0 };
    })
    .filter((b) => b.percent >= 85)
    .sort((a, b) => b.percent - a.percent)
    .map(
      (b) =>
        `${b.category}: ${money(b.spent)} of ${money(b.limit)} (${b.percent.toFixed(0)}%)`,
    );

  const label = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    month: label,
    spent_this_month: money(cur.expenses),
    income_this_month: money(cur.income),
    net_this_month: `${cur.net < 0 ? "-" : ""}${money(Math.abs(cur.net))}`,
    savings_rate_this_month:
      trends.kpis.savings_rate === null ? "not available (no income)" : `${trends.kpis.savings_rate.toFixed(1)}%`,
    average_monthly_spend: money(trends.kpis.average_monthly_expenses),
    months_in_average: String(trends.kpis.months),
    spending_change_vs_last_month:
      change === null ? "not available" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
    top_category: top
      ? `${top.name} (${top.percent.toFixed(0)}% of spending, ${money(top.amount)})`
      : "none",
    budgets_at_or_over_85_percent: nearLimit.length ? nearLimit : ["none"],
  };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("AI tips timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Numbers like 3,450.00, 24%, 2026. Commas and $ are ignored when comparing.
const NUMBER_TOKEN = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const normalize = (s) => s.replace(/[$,]/g, "");

// Never trust model output: check the shape, the length, and that every number
// it mentions is one of the facts we gave it.
function checkTips(tips, facts) {
  if (!Array.isArray(tips) || tips.length < 2 || tips.length > 3) {
    throw new Error("AI returned the wrong number of tips");
  }
  const allowed = new Set((JSON.stringify(facts).match(NUMBER_TOKEN) || []).map(normalize));

  return tips.map((t) => {
    if (typeof t?.title !== "string" || typeof t?.body !== "string") {
      throw new Error("AI tip has the wrong shape");
    }
    const title = t.title.trim();
    const body = t.body.trim();
    if (!title || !body || title.length > 60 || body.length > 300) {
      throw new Error("AI tip is the wrong length");
    }
    for (const token of `${title} ${body}`.match(NUMBER_TOKEN) || []) {
      if (!allowed.has(normalize(token))) {
        throw new Error(`AI tip used a number not in the facts: ${token}`);
      }
    }
    return { title, body };
  });
}

// Returns { source: "ai" | "static", tips: [{ title, body }] }
export async function getMonthlyTips(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const facts = await buildFacts(userId);

  let value;
  try {
    const raw = await withTimeout(generateTips(facts), TIMEOUT_MS);
    value = { source: "ai", tips: checkTips(raw, facts) };
  } catch (err) {
    console.warn("Using static tips:", err.message);
    value = { source: "static", tips: STATIC_TIPS };
  }

  // Only cache AI tips, so a slow day gets retried on the next load
  if (value.source === "ai") cache.set(userId, { at: Date.now(), value });
  return value;
}
