import express from "express";
import pool from "../db.js";
import {
  parseTransaction,
  validateParsedTransaction,
  chatAgent,
  getToday,
  AIParseError,
  AIUnavailableError,
} from "../services/gemini.js";
import {
  ENTITIES,
  mergeOps,
  checkItem,
  confirmText,
  askText,
  buildActions,
} from "../services/aiActions.js";
import { getMonthlyTips } from "../services/tips.js";

const router = express.Router();

// The user's accounts (with balances) and the categories they can use (defaults + their own).
// Used by /parse, which is the one-shot parser.
async function loadMappings(userId) {
  const [accounts] = await pool.query(
    "SELECT id, name, type, balance FROM accounts WHERE user_id = ?",
    [userId],
  );
  const [categories] = await pool.query(
    "SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = ?",
    [userId],
  );
  return { accounts, categories };
}

// Everything the chat needs to check a change: accounts, categories, budgets,
// savings goals and the 60 most recent transactions (so the user can change one).
async function loadContext(userId) {
  const [accounts] = await pool.query(
    "SELECT id, name, type, balance FROM accounts WHERE user_id = ?",
    [userId],
  );
  const [categories] = await pool.query(
    "SELECT id, name, is_default FROM categories WHERE user_id IS NULL OR user_id = ?",
    [userId],
  );
  const [budgets] = await pool.query(
    `SELECT b.id, b.category_id, c.name AS category_name, b.monthly_limit
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ?`,
    [userId],
  );
  const [goals] = await pool.query(
    `SELECT id, name, target_amount, DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date, current_amount
     FROM savings_goals
     WHERE user_id = ?`,
    [userId],
  );
  const [transactions] = await pool.query(
    `SELECT id, type, amount, DATE_FORMAT(date, '%Y-%m-%d') AS date, account_id,
            to_account_id, category_id, savings_goal_id, note
     FROM transactions
     WHERE user_id = ?
     ORDER BY date DESC, id DESC
     LIMIT 60`,
    [userId],
  );
  return {
    accounts,
    categories,
    budgets,
    goals,
    transactions,
    today: getToday().date,
  };
}

const YES =
  /^(yes|yeah|yep|yup|ok|okay|sure|correct|confirm|save|go ahead|sounds good|looks good)\b/i;
const NO = /^(no|nope|cancel|nevermind|never mind|don'?t save|dont save)\b/i;
function isShort(text) {
  return text.trim().split(/\s+/).length <= 3;
}

// Keeps the client's draft to the parts this route understands
function normalizeDraft(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.items)) {
    return { items: [], awaiting: null, raw_text: null };
  }
  return {
    items: d.items.filter(
      (i) => i && typeof i.id === "string" && ENTITIES.includes(i.entity),
    ),
    awaiting: d.awaiting === "confirm" ? "confirm" : null,
    raw_text: typeof d.raw_text === "string" ? d.raw_text : null,
  };
}

// POST /api/ai/chat
// Body: { text: "<the user's latest message>", draft: <draft from the last reply, or {}> }
// Replies with one of:
//   { status: "chat",    reply, draft }            -> no changes; just a reply
//   { status: "ask",     reply, draft }            -> something is missing or wrong; ask
//   { status: "confirm", reply, draft }            -> card text; the draft waits for yes/no
//   { status: "save",    actions, draft: {} }      -> client runs actions in order
//   { status: "cancelled", reply, draft: {} }      -> nothing saved
router.post("/chat", async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }
  const clean = text.trim();
  const draft = normalizeDraft(req.body.draft);

  try {
    const ctx = await loadContext(req.user.id);
    const awaiting = draft.awaiting === "confirm";

    // Yes or no on the card is handled here, so nothing is saved without a clear yes
    if (awaiting && isShort(clean)) {
      if (YES.test(clean) && !/\d/.test(clean)) {
        const checked = draft.items.map((i) => checkItem(i, ctx));
        if (checked.length && checked.every((c) => c.ok)) {
          return res.status(200).json({
            status: "save",
            actions: buildActions(checked, draft.raw_text),
            draft: { items: [], awaiting: null, raw_text: null },
          });
        }
        // Something changed since the card was shown: explain instead of saving
        return res.status(200).json({
          status: "ask",
          reply: askText(checked, ctx),
          draft: { ...draft, awaiting: null },
        });
      }
      if (NO.test(clean)) {
        return res.status(200).json({
          status: "cancelled",
          reply: "No problem, I didn't save anything.",
          draft: { items: [], awaiting: null, raw_text: null },
        });
      }
    }

    // One model call: the reply plus the changes this message makes
    // Tell the model what each item still needs, so a short answer fills the right field
    const pendingItems = draft.items.map((i) => ({
      ...i,
      missing: checkItem(i, ctx).missing,
    }));
    const agent = await chatAgent(clean, { ctx, items: pendingItems });
    const merged = mergeOps(draft.items, agent.ops);
    const rawText = draft.raw_text ? `${draft.raw_text} / ${clean}` : clean;

    // No changes: a question, small talk, or an unclear message
    if (merged.changed === 0) {
      if (merged.items.length === 0) {
        return res.status(200).json({
          status: "chat",
          reply: agent.reply || "What would you like to record?",
          draft: { items: [], awaiting: null, raw_text: null },
        });
      }
      // Keep the pending question: answer the user's comment, then ask again
      const checked = merged.items.map((i) => checkItem(i, ctx));
      const pending = awaiting
        ? "Should I save it? (yes / no)"
        : askText(checked, ctx);
      return res.status(200).json({
        status: awaiting ? "confirm" : "ask",
        reply: [agent.reply, pending].filter(Boolean).join(" "),
        draft: { ...draft, items: merged.items },
      });
    }

    // Changes were made: everything left in the draft
    if (merged.items.length === 0) {
      return res.status(200).json({
        status: "chat",
        reply: "Okay, I dropped that.",
        draft: { items: [], awaiting: null, raw_text: null },
      });
    }

    const checked = merged.items.map((i) => checkItem(i, ctx));
    if (checked.every((c) => c.ok)) {
      return res.status(200).json({
        status: "confirm",
        reply: confirmText(checked, ctx),
        draft: { items: merged.items, awaiting: "confirm", raw_text: rawText },
      });
    }

    return res.status(200).json({
      status: "ask",
      reply: askText(checked, ctx),
      draft: { items: merged.items, awaiting: null, raw_text: rawText },
    });
  } catch (err) {
    if (err instanceof AIParseError || err instanceof AIUnavailableError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("Unexpected AI chat route error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong while parsing. Try again." });
  }
});

// POST /api/ai/parse (one-shot parse, no chat)
router.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required for parsing" });
  }

  try {
    const user_id = req.user.id;
    const mappings = await loadMappings(user_id);

    const result = await parseTransaction(text, mappings);

    if (result.amount === null) {
      return res.status(422).json({
        error:
          "I couldn't find an amount. Try something like: spent 12 on lunch.",
        problems: result.problems,
      });
    }

    const missing = [];
    if (result.type === null) missing.push("type");
    if (result.account_id === null) missing.push("account");
    if (result.type === "transfer") {
      if (result.to_account_id === null) missing.push("to_account");
    } else if (result.category_id === null) {
      missing.push("category");
    }
    if (result.date === null) missing.push("date");

    return res.status(200).json({ ...result, missing });
  } catch (err) {
    if (err instanceof AIParseError || err instanceof AIUnavailableError) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error("Unexpected AI parse route error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong while parsing. Try again." });
  }
});

// GET /api/ai/tips - 2 or 3 monthly tips (AI, or a static list if the AI is slow or down)
router.get("/tips", async (req, res) => {
  try {
    res.status(200).json(await getMonthlyTips(req.user.id));
  } catch (err) {
    console.error("Tips error:", err);
    res.status(500).json({ error: "Failed to load tips" });
  }
});

export default router;
