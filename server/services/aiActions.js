// services/aiActions.js
//
// Rules for the Ask Centavo chat. These are plain functions with no database
// and no AI calls, so they can be tested on their own.
//   mergeOps     - puts the model's proposed changes into the draft
//   checkItem    - checks one draft item against the user's data and the rules
//   confirmText  - the plain-English card shown before saving
//   askText      - the next question (or problem) when something is missing
//   buildActions - the ordered API calls the client makes after "yes"
//
// The AI can create and change things. It can never delete. Removing an item
// only drops it from the pending card; nothing is deleted from the database.

export const ENTITIES = ["transaction", "budget", "goal", "category"];
export const TX_TYPES = ["expense", "income", "transfer", "savings"];
export const MAX_ITEMS = 10;

const FIELD_KEYS = [
  "type", "amount", "use_full_balance", "account_id", "to_account_id",
  "category_id", "new_category_name", "savings_goal_id", "date", "note",
  "name", "target_amount", "target_date", "monthly_limit",
];
const MAX_AMOUNT = 9999999999.99; // DECIMAL(12,2)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const money = (n) => `$${Number(n).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Whole-number id from the model or the client, or null
const toId = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

// Positive amount rounded to cents, or null
const toAmount = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? round2(n) : null;
};

function isRealDate(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// "2026-12-01" -> "Tue, Dec 1, 2026"
function friendlyDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

// Keeps only known fields with real values. Null, blank and unknown keys are dropped.
export function cleanFields(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of FIELD_KEYS) {
    let v = raw[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      v = v.trim();
      if (v === "") continue;
    }
    out[k] = v;
  }
  return out;
}

// Does this item look like a brand-new record? A new transaction always names a type;
// a new budget names a category and a limit; a new goal names a target and a date.
function looksNew(entity, f) {
  if (entity === "transaction") return f.type != null;
  if (entity === "budget") return f.monthly_limit != null && (f.category_id != null || f.new_category_name != null);
  if (entity === "goal") return f.target_amount != null && f.target_date != null;
  return false;
}

// Create or update, decided for every item after each change.
// Named record (target_id set): keep the action. No target: a create only when the
// details look new; otherwise it is an update that must say which record.
function settleAction(item) {
  if (item.target_id !== null) return item.action;
  if (item.action === "create") return "create";
  return looksNew(item.entity, item.fields) ? "create" : "update";
}

// Applies the model's ops to the draft items. Returns { items, changed }.
// An op with item_id changes that item; otherwise it adds a new item.
export function mergeOps(items, ops) {
  const out = (items || []).map((i) => ({ ...i, fields: { ...i.fields } }));
  let next =
    out.reduce((max, i) => Math.max(max, Number(i.id.slice(1)) || 0), 0) + 1;
  let changed = 0;

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== "object") continue;
    const idx =
      typeof op.item_id === "string"
        ? out.findIndex((i) => i.id === op.item_id)
        : -1;

    if (op.remove === true) {
      if (idx >= 0) {
        out.splice(idx, 1);
        changed++;
      }
      continue;
    }

    const action = op.action === "create" || op.action === "update" ? op.action : null;
    const fields = cleanFields(op.fields);
    const target = toId(op.target_id);

    if (idx >= 0) {
      if (Object.keys(fields).length || action || target !== null) changed++;
      out[idx].fields = { ...out[idx].fields, ...fields };
      if (action) out[idx].action = action;
      if (target !== null) out[idx].target_id = target;
      out[idx].action = settleAction(out[idx]);
    } else {
      if (!ENTITIES.includes(op.entity) || out.length >= MAX_ITEMS) continue;
      const item = {
        id: `i${next++}`,
        entity: op.entity,
        action: action || "create",
        target_id: target,
        fields,
      };
      item.action = settleAction(item);
      out.push(item);
      changed++;
    }
  }
  return { items: out, changed };
}

function findCategoryByName(ctx, name) {
  const key = String(name).trim().toLowerCase();
  return ctx.categories.find((c) => c.name.toLowerCase() === key) || null;
}

function fail(res, message) {
  res.problems.push(message);
}

// Checks one draft item. Returns:
//   { id, entity, action, target_id, values, missing, problems, ok, before, full }
// values: the cleaned details to save. missing: keys still needed (see askText).
// problems: messages to show the user. ok: true only when nothing is missing or wrong.
export function checkItem(item, ctx) {
  const res = {
    id: item.id,
    entity: item.entity,
    action: item.action === "update" ? "update" : "create",
    target_id: item.target_id ?? null,
    values: null,
    before: null,
    full: false,
    missing: [],
    problems: [],
    ok: false,
  };
  const f = item.fields || {};

  if (res.action === "update" && res.target_id === null) {
    fail(res, "Which one should I change? Tell me what it was for, or the date.");
  } else if (res.action === "update" && Object.keys(f).length === 0) {
    fail(res, "What should I change?");
  } else if (item.entity === "transaction") {
    checkTransaction(res, f, ctx);
  } else if (item.entity === "budget") {
    checkBudget(res, f, ctx);
  } else if (item.entity === "goal") {
    checkGoal(res, f, ctx);
  } else {
    checkCategory(res, f, ctx);
  }

  res.missing = [...new Set(res.missing)];
  res.ok = res.values !== null && res.missing.length === 0 && res.problems.length === 0;
  return res;
}

function checkTransaction(res, f, ctx) {
  let v;

  if (res.action === "update") {
    const tx = ctx.transactions.find((t) => Number(t.id) === Number(res.target_id));
    if (!tx) return fail(res, "I can't find that transaction anymore.");
    if (tx.type === "savings") return fail(res, "Savings entries can't be changed here.");
    v = {
      type: tx.type,
      amount: Number(tx.amount),
      date: tx.date,
      note: tx.note,
      account_id: tx.account_id,
      to_account_id: tx.to_account_id,
      category_id: tx.category_id,
      savings_goal_id: tx.savings_goal_id,
      new_category_name: null,
    };
    res.before = { ...v };
  } else {
    v = {
      type: null, amount: null, date: ctx.today, note: null,
      account_id: null, to_account_id: null, category_id: null,
      savings_goal_id: null, new_category_name: null,
    };
  }

  // Apply what the user gave
  let type = f.type ? String(f.type).trim().toLowerCase() : null;
  if (!type && res.action === "create") {
    if (toId(f.to_account_id) !== null) type = "transfer";
    else if (toId(f.savings_goal_id) !== null) type = "savings";
  }
  if (type) {
    if (!TX_TYPES.includes(type)) {
      return fail(res, "I can only record expenses, income, transfers and savings.");
    }
    v.type = type;
  }
  if (f.amount !== undefined) {
    const a = toAmount(f.amount);
    if (a === null) return fail(res, "That amount doesn't look right.");
    v.amount = a;
  }
  if (f.account_id !== undefined) v.account_id = toId(f.account_id);
  if (f.to_account_id !== undefined) v.to_account_id = toId(f.to_account_id);
  if (f.category_id !== undefined) v.category_id = toId(f.category_id);
  if (f.savings_goal_id !== undefined) v.savings_goal_id = toId(f.savings_goal_id);
  if (f.note !== undefined) v.note = String(f.note).slice(0, 200);
  if (f.date !== undefined) {
    if (!isRealDate(f.date)) return fail(res, "That date doesn't look right. What day was it?");
    v.date = f.date;
  }
  if (f.new_category_name) v.new_category_name = String(f.new_category_name).trim().slice(0, 100);

  // Account the money comes from
  const from = v.account_id !== null ? ctx.accounts.find((a) => Number(a.id) === v.account_id) : null;
  if (v.account_id === null) {
    res.missing.push("account");
  } else if (!from) {
    fail(res, "I couldn't find that account.");
    v.account_id = null;
    res.missing.push("account");
  }
  if (!v.type) res.missing.push("type");

  // "All" on a transfer or savings means the account's full balance
  const moves = v.type === "transfer" || v.type === "savings";
  if (moves && from && f.use_full_balance === true) {
    const bal = round2(Math.max(parseFloat(from.balance), 0));
    if (bal <= 0) {
      fail(res, `${from.name} has no money to ${v.type === "transfer" ? "move" : "save"}.`);
      v.amount = null;
    } else {
      v.amount = bal;
      res.full = true;
    }
  }
  if (v.amount === null) res.missing.push("amount");

  if (moves && from) {
    if (from.type === "credit_card") {
      fail(res, `${v.type === "transfer" ? "Transfers" : "Savings"} can't come from a credit card.`);
      v.account_id = null;
      res.missing.push("account");
    } else if (!res.full && v.amount !== null && v.amount > parseFloat(from.balance)) {
      fail(res, `${from.name} only has ${money(from.balance)}.`);
      v.amount = null;
      res.missing.push("amount");
    }
  }

  if (v.type === "transfer") {
    v.category_id = null;
    v.new_category_name = null;
    v.savings_goal_id = null;
    if (v.to_account_id === null) {
      res.missing.push("to_account");
    } else if (!ctx.accounts.some((a) => Number(a.id) === v.to_account_id)) {
      fail(res, "I couldn't find the destination account.");
      v.to_account_id = null;
      res.missing.push("to_account");
    } else if (v.to_account_id === v.account_id) {
      fail(res, "Those need to be two different accounts.");
      v.to_account_id = null;
      res.missing.push("to_account");
    }
  } else if (v.type === "savings") {
    v.category_id = null;
    v.new_category_name = null;
    v.to_account_id = null;
    if (v.savings_goal_id === null) {
      res.missing.push("goal");
    } else if (!ctx.goals.some((g) => Number(g.id) === v.savings_goal_id)) {
      fail(res, "I couldn't find that savings goal.");
      v.savings_goal_id = null;
      res.missing.push("goal");
    }
  } else if (v.type === "expense" || v.type === "income") {
    v.to_account_id = null;
    v.savings_goal_id = null;
    if (v.new_category_name) {
      const match = findCategoryByName(ctx, v.new_category_name);
      if (match) {
        v.category_id = Number(match.id);
        v.new_category_name = null;
      }
    }
    if (v.category_id !== null && !ctx.categories.some((c) => Number(c.id) === v.category_id)) {
      v.category_id = null;
    }
    if (v.category_id === null && !v.new_category_name) res.missing.push("category");
  }

  res.values = v;
}

function checkBudget(res, f, ctx) {
  const v = { category_id: null, new_category_name: null, category_name: null, monthly_limit: null };

  if (res.action === "update") {
    const b = ctx.budgets.find((x) => Number(x.id) === Number(res.target_id));
    if (!b) return fail(res, "I can't find that budget.");
    v.category_id = Number(b.category_id);
    v.category_name = b.category_name;
    res.before = { monthly_limit: Number(b.monthly_limit) };
  } else {
    const cid = toId(f.category_id);
    if (cid !== null && ctx.categories.some((c) => Number(c.id) === cid)) {
      v.category_id = cid;
    } else if (f.new_category_name) {
      const name = String(f.new_category_name).trim().slice(0, 100);
      const match = findCategoryByName(ctx, name);
      if (match) v.category_id = Number(match.id);
      else v.new_category_name = name;
    }
    if (v.category_id === null && !v.new_category_name) {
      res.missing.push("category");
    } else if (v.category_id !== null) {
      // One budget per category: a second one becomes a change to the existing budget
      const existing = ctx.budgets.find((b) => Number(b.category_id) === v.category_id);
      if (existing) {
        res.action = "update";
        res.target_id = Number(existing.id);
        res.before = { monthly_limit: Number(existing.monthly_limit) };
      }
    }
    const cat = ctx.categories.find((c) => Number(c.id) === v.category_id);
    v.category_name = cat ? cat.name : v.new_category_name;
  }

  if (f.monthly_limit !== undefined) {
    const limit = toAmount(f.monthly_limit);
    if (limit === null) return fail(res, "That monthly limit doesn't look right.");
    v.monthly_limit = limit;
  }
  if (v.monthly_limit === null) res.missing.push("limit");

  res.values = v;
}

function checkGoal(res, f, ctx) {
  let v;
  if (res.action === "update") {
    const g = ctx.goals.find((x) => Number(x.id) === Number(res.target_id));
    if (!g) return fail(res, "I can't find that savings goal.");
    v = { name: g.name, target_amount: Number(g.target_amount), target_date: g.target_date };
    res.before = { ...v };
  } else {
    v = { name: null, target_amount: null, target_date: null };
  }

  if (f.name !== undefined) {
    const name = String(f.name).trim().slice(0, 100);
    if (name) v.name = name;
  }
  if (f.target_amount !== undefined) {
    const a = toAmount(f.target_amount);
    if (a === null) return fail(res, "That target amount doesn't look right.");
    v.target_amount = a;
  }
  if (f.target_date !== undefined) {
    if (!isRealDate(f.target_date)) return fail(res, "That target date doesn't look right.");
    v.target_date = f.target_date;
  }

  if (!v.name) res.missing.push("name");
  if (v.target_amount === null) res.missing.push("target_amount");
  if (!v.target_date) res.missing.push("target_date");
  res.values = v;

  if (v.name) {
    const dupe = ctx.goals.find(
      (g) => g.name.toLowerCase() === v.name.toLowerCase() && Number(g.id) !== Number(res.target_id),
    );
    if (dupe) fail(res, `You already have a goal called "${v.name}".`);
  }
}

function checkCategory(res, f, ctx) {
  const name = String(f.name || f.new_category_name || "").trim().slice(0, 100);

  if (res.action === "update") {
    const c = ctx.categories.find((x) => Number(x.id) === Number(res.target_id));
    if (!c) return fail(res, "I can't find that category.");
    if (c.is_default) return fail(res, `"${c.name}" is a default category and can't be renamed.`);
    res.before = { name: c.name };
  }

  if (!name) {
    res.missing.push("name");
    return;
  }
  const dupe = ctx.categories.some(
    (c) => c.name.toLowerCase() === name.toLowerCase() && Number(c.id) !== Number(res.target_id),
  );
  if (dupe) return fail(res, `You already have a category called "${name}".`);
  res.values = { name };
}

// ---------- Plain-English lines for the confirm card ----------

const accName = (ctx, id) =>
  ctx.accounts.find((a) => Number(a.id) === Number(id))?.name ?? "an account";
const goalName = (ctx, id) =>
  ctx.goals.find((g) => Number(g.id) === Number(id))?.name ?? "a goal";
const catName = (ctx, v) => {
  if (v.new_category_name) return `new category "${v.new_category_name}"`;
  if (v.category_id === null || v.category_id === undefined) return "no category";
  return ctx.categories.find((c) => Number(c.id) === Number(v.category_id))?.name ?? "a category";
};

function describeTx(v, ctx) {
  const when = friendlyDate(v.date);
  if (v.type === "transfer") {
    const from = accName(ctx, v.account_id);
    const all = v.full ? ` (all of ${from})` : "";
    return `Move ${money(v.amount)} from ${from} to ${accName(ctx, v.to_account_id)}${all}, ${when}.`;
  }
  if (v.type === "savings") {
    const from = accName(ctx, v.account_id);
    const all = v.full ? ` (all of ${from})` : "";
    return `Put ${money(v.amount)} from ${from} into "${goalName(ctx, v.savings_goal_id)}"${all}, ${when}.`;
  }
  const note = v.note ? ` for ${v.note}` : "";
  return `${cap(v.type)} of ${money(v.amount)}${note}, ${accName(ctx, v.account_id)}, ${catName(ctx, v)}, ${when}.`;
}

// "Change the lunch from Fri, Nov 6, 2026: amount $12.50 to $15.00."
// Lists only the parts that actually changed.
function describeTxChange(before, after, ctx) {
  const parts = [];
  if (after.amount !== before.amount) parts.push(`amount ${money(before.amount)} to ${money(after.amount)}`);
  if (after.date !== before.date) parts.push(`date to ${friendlyDate(after.date)}`);
  if (after.type !== before.type) parts.push(`type to ${after.type}`);
  if (after.account_id !== before.account_id) parts.push(`account to ${accName(ctx, after.account_id)}`);
  if (after.category_id !== before.category_id || after.new_category_name) {
    parts.push(`category to ${catName(ctx, after)}`);
  }
  if ((after.note || null) !== (before.note || null)) parts.push(`note to "${after.note || ""}"`);
  const label = before.note || cap(before.type);
  return `Change "${label}" from ${friendlyDate(before.date)}: ${parts.join(", ") || "no changes"}.`;
}

// One line per item, for the confirm card
export function describe(c, ctx) {
  const v = c.values;
  if (c.entity === "transaction") {
    if (c.action === "create") return describeTx({ ...v, full: c.full }, ctx);
    return describeTxChange(c.before, v, ctx);
  }
  if (c.entity === "budget") {
    if (c.action === "create") {
      return `New budget for ${v.category_name}: ${money(v.monthly_limit)} a month.`;
    }
    return `Change the ${v.category_name} budget from ${money(c.before.monthly_limit)} to ${money(v.monthly_limit)} a month.`;
  }
  if (c.entity === "goal") {
    if (c.action === "create") {
      return `New savings goal "${v.name}": ${money(v.target_amount)} by ${friendlyDate(v.target_date)}.`;
    }
    const parts = [];
    if (v.name !== c.before.name) parts.push(`rename to "${v.name}"`);
    if (v.target_amount !== c.before.target_amount) parts.push(`target to ${money(v.target_amount)}`);
    if (v.target_date !== c.before.target_date) parts.push(`date to ${friendlyDate(v.target_date)}`);
    return `Change goal "${c.before.name}": ${parts.join(", ")}.`;
  }
  // category
  if (c.action === "create") return `New category "${v.name}".`;
  return `Rename "${c.before.name}" to "${v.name}".`;
}

// The read-back shown before saving. Only used when every item is ok.
export function confirmText(checked, ctx) {
  const lines = checked.map((c) => describe(c, ctx));
  if (lines.length === 1) return `${lines[0]} Save it? (yes / no)`;
  return `${lines.map((l, i) => `${i + 1}) ${l}`).join(" ")} Save all of these? (yes / no)`;
}

// ---------- Questions for missing details ----------

function question(key, c, ctx) {
  const v = c.values || {};
  const spendable = ctx.accounts.filter((a) => a.type !== "credit_card");
  switch (key) {
    case "amount":
      if (v.type === "transfer") return "How much should I move?";
      if (v.type === "savings") return "How much should go into the goal?";
      if (c.entity === "goal") return "What's the target amount?";
      return "How much was it?";
    case "type":
      return "Was that money you spent, received, moved between your accounts, or put toward a savings goal?";
    case "account":
      return `Which account is it from? (${(v.type === "transfer" || v.type === "savings" ? spendable : ctx.accounts).map((a) => a.name).join(", ")})`;
    case "to_account":
      return `Which account should the money go to? (${ctx.accounts.filter((a) => a.id !== v.account_id).map((a) => a.name).join(", ")})`;
    case "category":
      return `What category should it go in? (${ctx.categories.map((x) => x.name).join(", ")})`;
    case "goal":
      return ctx.goals.length
        ? `Which savings goal is it for? (${ctx.goals.map((g) => g.name).join(", ")})`
        : "You don't have a savings goal yet. Want to create one first?";
    case "name":
      if (c.entity === "goal") return "What should the goal be called?";
      if (c.entity === "category") return "What should the category be called?";
      return "What should I call it?";
    case "target_amount":
      return "What's the target amount?";
    case "target_date":
      return "When do you want to reach it?";
    case "limit":
      return "What's the monthly limit?";
    default:
      return "Can you tell me a bit more?";
  }
}

// What to say when the draft isn't ready: every problem, then one question
export function askText(checked, ctx) {
  const parts = checked.flatMap((c) => c.problems);
  const next = checked.find((c) => c.missing.length > 0);
  if (next) parts.push(question(next.missing[0], next, ctx));
  return parts.join(" ") || "Can you tell me a bit more?";
}

// ---------- Save plan ----------

// The ordered API calls for the client to run after "yes".
// New categories come first; items that use them carry a category_key.
export function buildActions(checked, rawText) {
  const actions = [];
  const newCats = new Map(); // lowercase name -> key
  const keyFor = (name) => {
    const lower = name.toLowerCase();
    if (!newCats.has(lower)) {
      newCats.set(lower, `new:${lower}`);
      actions.push({ kind: "category_create", key: `new:${lower}`, name });
    }
    return `new:${lower}`;
  };

  for (const c of checked) {
    if (!c.ok) continue;
    const v = c.values;
    if (c.entity === "category" && c.action === "create") keyFor(v.name);
    if (c.entity === "transaction" && v.new_category_name) keyFor(v.new_category_name);
    if (c.entity === "budget" && v.new_category_name) keyFor(v.new_category_name);
  }

  for (const c of checked) {
    if (!c.ok) continue;
    const v = c.values;

    if (c.entity === "category") {
      if (c.action === "update") actions.push({ kind: "category_rename", id: c.target_id, name: v.name });
    } else if (c.entity === "transaction") {
      const body = {
        type: v.type,
        account_id: v.account_id,
        to_account_id: v.to_account_id,
        category_id: v.category_id,
        savings_goal_id: v.savings_goal_id,
        amount: v.amount,
        date: v.date,
        note: v.note,
      };
      const category_key = v.new_category_name ? keyFor(v.new_category_name) : null;
      if (c.action === "create") {
        actions.push({
          kind: "transaction_create",
          category_key,
          body: { ...body, source: "ai_text", ai_input_text: rawText || null },
        });
      } else {
        actions.push({ kind: "transaction_update", id: c.target_id, category_key, body });
      }
    } else if (c.entity === "budget") {
      if (c.action === "create") {
        actions.push({
          kind: "budget_create",
          category_key: v.new_category_name ? keyFor(v.new_category_name) : null,
          body: { category_id: v.category_id, monthly_limit: v.monthly_limit },
        });
      } else {
        actions.push({ kind: "budget_update", id: c.target_id, monthly_limit: v.monthly_limit });
      }
    } else if (c.entity === "goal") {
      const body = { name: v.name, target_amount: v.target_amount, target_date: v.target_date };
      if (c.action === "create") actions.push({ kind: "goal_create", body });
      else actions.push({ kind: "goal_update", id: c.target_id, body });
    }
  }
  return actions;
}
