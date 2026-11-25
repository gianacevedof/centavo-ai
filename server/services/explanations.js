import pool from "../db.js";
import { buildBudgetProgress } from "./budgetOverview.js";
import { generateExplanation } from "./gemini.js";

const TIMEOUT_MS = 8000;
const NUMBER_TOKEN = /-?\$?\d[\d,]*(?:\.\d+)?/g;

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;
const formatMoney = (cents) => {
  const sign = cents < 0 ? "-$" : "$";
  return `${sign}${Math.abs(fromCents(cents)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

function normalizeNumber(token) {
  const value = Number(token.replace(/[$,]/g, ""));
  if (!Number.isFinite(value)) return null;
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function numbersIn(value) {
  return (JSON.stringify(value).match(NUMBER_TOKEN) || [])
    .map(normalizeNumber)
    .filter((number) => number !== null);
}

export function checkExplanationNumbers(reply, facts, kind) {
  if (typeof reply !== "string" || !reply.trim() || reply.length > 600) {
    throw new Error("AI explanation has the wrong shape or length");
  }
  if (
    kind === "account_balance" &&
    normalizeNumber(facts.amount_before_tracked_activity) === "0.00" &&
    /\b(?:before tracked activity|opening|starting|started with|initial balance)\b/i.test(reply)
  ) {
    throw new Error("AI explanation mentioned a zero amount before tracked activity");
  }

  const allowed = new Set(numbersIn(facts));
  for (const token of reply.match(NUMBER_TOKEN) || []) {
    if (!allowed.has(normalizeNumber(token))) {
      throw new Error(`AI explanation used a number not in the facts: ${token}`);
    }
  }
  return reply.trim();
}

export async function buildAccountFacts(userId, accountId) {
  const [accounts] = await pool.query(
    "SELECT id, name, type, balance FROM accounts WHERE id = ? AND user_id = ?",
    [accountId, userId],
  );
  if (accounts.length === 0) return null;

  const [transactions] = await pool.query(
    `SELECT type, amount, account_id, to_account_id
     FROM transactions
     WHERE user_id = ? AND (account_id = ? OR (type = 'transfer' AND to_account_id = ?))`,
    [userId, accountId, accountId],
  );

  const totals = {
    expenses: 0,
    income: 0,
    transfers_in: 0,
    transfers_out: 0,
    savings_contributions: 0,
  };
  for (const transaction of transactions) {
    const amount = toCents(transaction.amount);
    if (transaction.type === "expense") totals.expenses += amount;
    else if (transaction.type === "income") totals.income += amount;
    else if (transaction.type === "savings") totals.savings_contributions += amount;
    else if (transaction.type === "transfer") {
      if (Number(transaction.account_id) === Number(accountId)) {
        totals.transfers_out += amount;
      }
      if (Number(transaction.to_account_id) === Number(accountId)) {
        totals.transfers_in += amount;
      }
    }
  }

  const netRecordedActivity =
    totals.income +
    totals.transfers_in -
    totals.expenses -
    totals.transfers_out -
    totals.savings_contributions;
  const balance = toCents(accounts[0].balance);

  return {
    account_name: accounts[0].name,
    account_type: accounts[0].type,
    current_balance: formatMoney(balance),
    expenses: formatMoney(totals.expenses),
    income: formatMoney(totals.income),
    transfers_in: formatMoney(totals.transfers_in),
    transfers_out: formatMoney(totals.transfers_out),
    savings_contributions: formatMoney(totals.savings_contributions),
    net_recorded_activity: formatMoney(netRecordedActivity),
    amount_before_tracked_activity: formatMoney(balance - netRecordedActivity),
  };
}

export async function buildBudgetFacts(userId, budgetId) {
  const budgets = await buildBudgetProgress(userId, budgetId);
  if (budgets.length === 0) return null;

  const budget = budgets[0];
  const limit = toCents(budget.monthly_limit);
  const spent = toCents(budget.spent);
  const difference = spent - limit;
  if (difference === 0) {
    return {
      category: budget.category_name,
      monthly_limit: formatMoney(limit),
      spent: formatMoney(spent),
      status: "at_limit",
    };
  }

  return {
    category: budget.category_name,
    monthly_limit: formatMoney(limit),
    spent: formatMoney(spent),
    status: difference > 0 ? "over" : "under",
    ...(difference > 0
      ? { amount_over_budget: formatMoney(difference) }
      : { amount_under_budget: formatMoney(-difference) }),
  };
}

export function factsAsPlainText(kind, facts) {
  if (kind === "account_balance") {
    const activity =
      `${facts.income} income and ${facts.transfers_in} transferred in, ` +
      `offset by ${facts.expenses} in expenses, ${facts.transfers_out} transferred out, ` +
      `and ${facts.savings_contributions} in savings contributions`;
    const before = normalizeNumber(facts.amount_before_tracked_activity);
    const beforeText =
      before !== "0.00"
        ? ` Amount before tracked activity: ${facts.amount_before_tracked_activity}.`
        : "";
    return `${facts.account_name} currently has a balance of ${facts.current_balance}. Recorded activity includes ${activity}.${beforeText}`;
  }

  if (kind === "budget") {
    if (facts.status === "over") {
      return `${facts.category} is over its monthly budget: ${facts.spent} spent against a ${facts.monthly_limit} limit, or ${facts.amount_over_budget} over.`;
    }
    if (facts.status === "under") {
      return `${facts.category} is under its monthly budget: ${facts.spent} spent against a ${facts.monthly_limit} limit, leaving ${facts.amount_under_budget}.`;
    }
  }

  throw new Error("Unsupported explanation type");
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Explanation timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function explainFacts(kind, facts, generate = generateExplanation) {
  const fallback = factsAsPlainText(kind, facts);
  try {
    const reply = await withTimeout(generate(kind, facts), TIMEOUT_MS);
    return {
      facts,
      explanation: checkExplanationNumbers(reply, facts, kind),
      source: "ai",
    };
  } catch (error) {
    console.warn("Using facts-only explanation:", error.message);
    return { facts, explanation: fallback, source: "facts" };
  }
}
