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

// "Today" in the app's timezone, same timezone the parser uses
function todayInAppTimezone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Which details are still missing, in the order we ask for them
function findMissing(d) {
  const missing = [];
  if (!(d.amount > 0)) missing.push("amount");
  if (!d.type) missing.push("type");
  if (d.account_id === null || d.account_id === undefined) missing.push("account");
  if (d.category_id === null || d.category_id === undefined) missing.push("category");
  if (!d.date) missing.push("date");
  return missing;
}

// One conversational question for the first missing detail
function askFor(field, mappings) {
  switch (field) {
    case "amount":
      return "How much was it?";
    case "type":
      return "Was that money you spent, or money you received?";
    case "account":
      return `Which account was it on? (${mappings.accounts.map((a) => a.name).join(", ")})`;
    case "category":
      return `What category should it go in? (${mappings.categories.map((c) => c.name).join(", ")})`;
    case "date":
      return "Was it today? If not, what day was it?";
    default:
      return "Can you tell me a bit more?";
  }
}

// Reads a date like 2026-10-16 as a friendly day, e.g. "Friday, Oct 16"
function friendlyDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The read-back shown before saving
function confirmTextFor(d, mappings) {
  const account = mappings.accounts.find((a) => Number(a.id) === Number(d.account_id));
  const category = mappings.categories.find((c) => Number(c.id) === Number(d.category_id));
  const kind = d.type === "income" ? "income" : "expense";
  const note = d.note ? ` for ${d.note}` : "";
  return `Thanks! Here's what I have: ${kind} of $${d.amount.toFixed(2)}${note}, on ${account?.name}, category ${category?.name}, ${friendlyDate(d.date)}. Should I save it?`;
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
    date: pick(parsed.date, draft.date),
    note: pick(parsed.note, draft.note),
  };
}

// Short replies that mean yes or no to the read-back (kept short so a correction isn't read as a yes)
const YES = /^(yes|yeah|yep|yup|ok|okay|sure|correct|confirm|save|go ahead|sounds good|looks good)\b/i;
const NO = /^(no|nope|cancel|nevermind|never mind|don'?t save|dont save)\b/i;
function isShort(text) {
  return text.trim().split(/\s+/).length <= 3;
}

// POST /api/ai/chat
// Body: { text: "<the user's latest message>", draft: <draft from the last reply, or {}> }
// Replies with one of:
//   { status: "ask", reply, missing, draft }      -> ask the reply, send the next message with the draft
//   { status: "confirm", reply, draft }           -> read-back; the draft is now waiting for yes/no
//   { status: "save", reply, payload }            -> the user said yes; client saves payload with POST /api/transactions
//   { status: "cancelled", reply, draft: {} }     -> the user said no; nothing is saved
router.post("/chat", async (req, res) => {
  const { text, draft: incomingDraft } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }
  const clean = text.trim();
  const draft = incomingDraft && typeof incomingDraft === "object" ? incomingDraft : {};

  try {
    const user_id = req.user.id;
    const mappings = await loadMappings(user_id);

    // Waiting for yes/no on the read-back
    if (draft.awaiting === "confirm" && isShort(clean)) {
      if (YES.test(clean) && !/\d/.test(clean)) {
        const payload = {
          type: draft.type,
          account_id: Number(draft.account_id),
          category_id: Number(draft.category_id),
          amount: Number(draft.amount),
          date: draft.date,
          note: draft.note || null,
          source: "ai_text",
          ai_input_text: draft.raw_text || null,
        };
        return res.status(200).json({ status: "save", reply: "Done, saved it!", payload });
      }
      if (NO.test(clean)) {
        return res.status(200).json({
          status: "cancelled",
          reply: "No problem, I didn't save it.",
          draft: {},
        });
      }
    }

    const parsed = await parseTransaction(clean, mappings);
    if (parsed.problems.includes("transfer_not_supported")) {
      return res.status(422).json({
        error: "Transfers aren't supported by the AI. Please use the manual form.",
      });
    }

    // Answering "yes" to "was it today?" means today
    const missingBefore = findMissing(draft);
    if (missingBefore[0] === "date" && YES.test(clean) && isShort(clean)) {
      parsed.date = todayInAppTimezone();
    }

    // Re-check the merged details against this user's accounts and categories
    const checked = validateParsedTransaction(mergeDraft(draft, parsed), mappings);
    const raw = draft.raw_text ? `${draft.raw_text} / ${clean}` : clean;
    const next = { ...checked, raw_text: raw };

    const missing = findMissing(next);
    if (missing.length > 0) {
      return res.status(200).json({
        status: "ask",
        reply: askFor(missing[0], mappings),
        missing,
        draft: next,
      });
    }

    return res.status(200).json({
      status: "confirm",
      reply: confirmTextFor(next, mappings),
      draft: { ...next, awaiting: "confirm" },
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
