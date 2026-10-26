import express from "express";
import pool from "../db.js";
import {
  parseTransaction,
  validateParsedTransaction,
  chatTurn,
  AIParseError,
  AIUnavailableError,
} from "../services/gemini.js";

const router = express.Router();

// The user's accounts (with balances) and the categories they can use (defaults + their own)
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

// Which details are still missing, in the order we ask for them.
// Transfers need a "to" account and no category; other types need a category.
function findMissing(d) {
  const missing = [];
  if (!(d.amount > 0)) missing.push("amount");
  if (!d.type) missing.push("type");
  if (d.account_id === null || d.account_id === undefined) missing.push("account");
  if (d.type === "transfer") {
    if (d.to_account_id === null || d.to_account_id === undefined) missing.push("to_account");
  } else if (d.category_id === null || d.category_id === undefined) {
    missing.push("category");
  }
  if (!d.date) missing.push("date");
  return missing;
}

// Fallback question, used only if the AI gives no reply
function askFor(field, mappings) {
  const accountNames = mappings.accounts.map((a) => a.name).join(", ");
  switch (field) {
    case "amount":
      return "How much was it?";
    case "type":
      return "Was that money you spent, received, or a move between your accounts?";
    case "account":
      return `Which account is it from? (${accountNames})`;
    case "to_account":
      return `Which account should the money go to? (${accountNames})`;
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

// Varied openers for the read-back so it doesn't repeat the same phrase
const OPENERS = ["Here's what I have:", "Okay, so:", "Got it:", "Let me check:"];
function opener() {
  return OPENERS[Math.floor(Math.random() * OPENERS.length)];
}

// The read-back shown before saving. Built here, so the numbers and names are always exact.
function confirmTextFor(d, mappings) {
  const name = (id) => mappings.accounts.find((a) => Number(a.id) === Number(id))?.name;
  const when = friendlyDate(d.date);
  if (d.type === "transfer") {
    return `${opener()} move $${d.amount.toFixed(2)} from ${name(d.account_id)} to ${name(d.to_account_id)}, ${when}. Should I save it?`;
  }
  const category = mappings.categories.find((c) => Number(c.id) === Number(d.category_id));
  const kind = d.type === "income" ? "income" : "expense";
  const note = d.note ? ` for ${d.note}` : "";
  return `${opener()} ${kind} of $${d.amount.toFixed(2)}${note}, on ${name(d.account_id)}, category ${category?.name}, ${when}. Should I save it?`;
}

// Puts the values from this message over the draft. Null means "not given", so the draft keeps its value.
const CHAT_FIELDS = ["amount", "type", "account_id", "to_account_id", "category_id", "date", "note"];
function applyUpdates(draft, updates) {
  const out = { ...draft };
  for (const k of CHAT_FIELDS) {
    if (updates[k] !== null && updates[k] !== undefined) out[k] = updates[k];
  }
  return out;
}

// Short replies that mean yes or no to the read-back
const YES = /^(yes|yeah|yep|yup|ok|okay|sure|correct|confirm|save|go ahead|sounds good|looks good)\b/i;
const NO = /^(no|nope|cancel|nevermind|never mind|don'?t save|dont save)\b/i;
function isShort(text) {
  return text.trim().split(/\s+/).length <= 3;
}

// Names of accounts other than the given one (or any, if none given)
function namesExcept(mappings, id, filter = () => true) {
  return mappings.accounts
    .filter((a) => filter(a) && (id === null || Number(a.id) !== Number(id)))
    .map((a) => a.name)
    .join(", ");
}

// POST /api/ai/chat
// Body: { text: "<the user's latest message>", draft: <draft from the last reply, or {}> }
// Replies with one of:
//   { status: "ask", reply, missing, draft }      -> show reply; send the next message with the draft
//   { status: "confirm", reply, draft }           -> read-back; the draft waits for yes/no
//   { status: "save", reply, payload }            -> client saves payload with POST /api/transactions
//   { status: "cancelled", reply, draft: {} }     -> nothing saved
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
    const awaitingConfirm = draft.awaiting === "confirm";

    // Yes or no on the read-back is handled here, so nothing is saved without a clear yes
    if (awaitingConfirm && isShort(clean)) {
      if (YES.test(clean) && !/\d/.test(clean)) {
        const isTransfer = draft.type === "transfer";
        const payload = {
          type: draft.type,
          account_id: Number(draft.account_id),
          ...(isTransfer
            ? { to_account_id: Number(draft.to_account_id) }
            : { category_id: Number(draft.category_id) }),
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

    // One AI call: the reply plus the details from this message
    const turn = await chatTurn(clean, { mappings, draft, missing: findMissing(draft) });
    const hasUpdates =
      turn.action === "update" && Object.values(turn.updates).some((v) => v !== null);

    // Check the details against this user's accounts and categories and the rules
    const next = validateParsedTransaction(
      hasUpdates ? applyUpdates(draft, turn.updates) : { ...draft },
      mappings,
    );
    delete next.awaiting;

    let override = null; // a rule problem: its message replaces the AI's reply
    const fromAccount = mappings.accounts.find((a) => Number(a.id) === Number(next.account_id));

    if (next.type === "transfer" && next.account_id !== null && next.problems.includes("to_account_id")) {
      next.to_account_id = null;
      override = {
        reply: `Those need to be two different accounts. Which account should the money go to? (${namesExcept(mappings, next.account_id)})`,
      };
    } else if (next.type === "transfer" && fromAccount?.type === "credit_card") {
      next.account_id = null;
      override = {
        reply: `Transfers can't come from a credit card. Which account should the money come from? (${namesExcept(mappings, null, (a) => a.type !== "credit_card")})`,
      };
    } else if (next.type === "transfer" && fromAccount && next.amount > parseFloat(fromAccount.balance)) {
      next.amount = null;
      override = {
        reply: `${fromAccount.name} only has $${parseFloat(fromAccount.balance).toFixed(2)}. How much should I move?`,
      };
    }

    next.raw_text = draft.raw_text ? `${draft.raw_text} / ${clean}` : clean;

    const missing = findMissing(next);
    if (missing.length > 0) {
      return res.status(200).json({
        status: "ask",
        reply: override?.reply || turn.reply || askFor(missing[0], mappings),
        missing,
        draft: next,
      });
    }

    // Everything is there: read it back and wait for yes or no
    const readBack = confirmTextFor(next, mappings);
    const reply =
      turn.action === "chat" && turn.reply ? `${turn.reply} ${readBack}` : readBack;

    return res.status(200).json({
      status: "confirm",
      reply,
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

export default router;
