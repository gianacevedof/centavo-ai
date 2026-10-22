import express from "express";
import pool from "../db.js";
import {
  parseTransaction,
  validateParsedTransaction,
  AIParseError,
  AIUnavailableError,
} from "../services/gemini.js";

const router = express.Router();

// The user's accounts and the categories they can use (defaults + their own)
async function loadMappings(userId) {
  const [accounts] = await pool.query(
    "SELECT id, name, type FROM accounts WHERE user_id = ?",
    [userId],
  );
  const [categories] = await pool.query(
    "SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = ?",
    [userId],
  );
  return { accounts, categories };
}

// Which details are still missing, in the order we ask for them
function findMissing(d) {
  const missing = [];
  if (!(d.amount > 0)) missing.push("amount");
  if (!d.type) missing.push("type");
  if (d.account_id === null || d.account_id === undefined) missing.push("account");
  if (d.category_id === null || d.category_id === undefined) missing.push("category");
  if (!d.date || d.date_pending) missing.push("date");
  return missing;
}

// One question at a time: the first missing detail, in the order of findMissing
function questionFor(missing, mappings) {
  switch (missing[0]) {
    case "amount":
      return "How much was it?";
    case "type":
      return "Was that money you spent or money you received?";
    case "account":
      return "Which account is it for?";
    case "category":
      return "Which category should it go in?";
    case "date":
      return "Is this transaction from today?";
    default:
      return "Can you tell me a bit more?";
  }
}

// "Today" in the app's timezone, same timezone the parser uses
function todayInAppTimezone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Works out the date and whether it still needs the user to confirm it.
// The parser fills in today when no date is given, so a date that is today is
// only confirmed once the user says so (or gives a different date).
function resolveDate(draft, parsed, text) {
  const today = todayInAppTimezone();
  const saysToday = /\b(yes|yeah|yep|yup|correct|right|sure|today)\b/i.test(text)
    && !/\b(not|no)\s+today\b/i.test(text);
  const explicitToday = /\btoday\b/i.test(text) && !/\b(not|no)\s+today\b/i.test(text);

  // First message: the parser's date is either the one the user gave or today by default
  if (draft.date === undefined || draft.date === null) {
    if (!parsed.date) return { date: null, date_pending: false };
    if (parsed.date !== today) return { date: parsed.date, date_pending: false };
    return { date: today, date_pending: !explicitToday };
  }

  // Later message while the date is still waiting for an answer
  if (draft.date_pending) {
    if (parsed.date && parsed.date !== today) return { date: parsed.date, date_pending: false };
    if (saysToday) return { date: today, date_pending: false };
    return { date: draft.date, date_pending: true };
  }

  // Already confirmed earlier
  return { date: draft.date, date_pending: false };
}

// Keeps what the user already gave us. A new value from this message replaces the old one.
function mergeDraft(draft, parsed) {
  const pick = (newVal, oldVal) =>
    newVal !== null && newVal !== undefined ? newVal : oldVal ?? null;
  return {
    amount: pick(parsed.amount, draft.amount),
    type: pick(parsed.type, draft.type),
    account_id: pick(parsed.account_id, draft.account_id),
    category_id: pick(parsed.category_id, draft.category_id),
    note: pick(parsed.note, draft.note),
  };
}

// Quick-reply choices for each missing detail. Tapping one sends its text as the next message.
function optionsFor(missing, mappings) {
  const options = {};
  for (const field of missing) {
    switch (field) {
      case "type":
        options.type = ["Spent", "Received"];
        break;
      case "account":
        options.account = mappings.accounts.map((a) => a.name);
        break;
      case "category":
        options.category = mappings.categories.slice(0, 8).map((c) => c.name);
        break;
      case "date":
        options.date = ["Today", "Yesterday"];
        break;
      default:
        break;
    }
  }
  return options;
}

function summaryFor(d, mappings) {
  const account = mappings.accounts.find((a) => Number(a.id) === Number(d.account_id));
  const category = mappings.categories.find((c) => Number(c.id) === Number(d.category_id));
  const kind = d.type === "income" ? "Income" : "Expense";
  const note = d.note ? ` for "${d.note}"` : "";
  return `${kind} of $${d.amount.toFixed(2)}${note} on ${account?.name}, category ${category?.name}, dated ${d.date}. Save it?`;
}

// POST /api/ai/chat
// Body: { text: "<the user's latest message>", draft: <the draft from the last reply, or {}> }
// Replies with either:
//   { status: "ask", question, missing, draft }  -> show the question, send the next message with the draft
//   { status: "confirm", summary, draft }        -> show the summary; on "yes", save the draft with POST /api/transactions
// Nothing is saved by this route.
router.post("/chat", async (req, res) => {
  const { text, draft: incomingDraft } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }
  const draft = incomingDraft && typeof incomingDraft === "object" ? incomingDraft : {};

  try {
    const user_id = req.user.id;
    const mappings = await loadMappings(user_id);

    const parsed = await parseTransaction(text, mappings);
    if (parsed.problems.includes("transfer_not_supported")) {
      return res.status(422).json({
        error: "Transfers aren't supported by the AI. Please use the manual form.",
      });
    }

    // Re-check the merged draft against this user's accounts and categories
    const checked = validateParsedTransaction(mergeDraft(draft, parsed), mappings);
    const dateInfo = resolveDate(draft, parsed, text);
    checked.date = dateInfo.date;
    checked.date_pending = dateInfo.date_pending;

    const missing = findMissing(checked);
    if (missing.length > 0) {
      return res.status(200).json({
        status: "ask",
        question: questionFor(missing, mappings),
        missing,
        options: optionsFor(missing.slice(0, 1), mappings),
        draft: checked,
      });
    }

    return res.status(200).json({
      status: "confirm",
      summary: summaryFor(checked, mappings),
      draft: checked,
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

// POST /api/ai/parse (unchanged from Oct 16)
router.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required for parsing" });
  }

  try {
    const user_id = req.user.id;
    const mappings = await loadMappings(user_id);

    const result = await parseTransaction(text, mappings);

    if (result.problems.includes("transfer_not_supported")) {
      return res.status(422).json({
        error:
          "Transfers aren't supported by the AI. Please use the manual form.",
      });
    }

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
    if (result.category_id === null) missing.push("category");
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

export default router;
