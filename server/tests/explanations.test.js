import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import pool from "../db.js";
import explanationsRoutes from "../routes/explanations.js";
import {
  buildAccountFacts,
  buildBudgetFacts,
  checkExplanationNumbers,
  explainFacts,
  factsAsPlainText,
} from "../services/explanations.js";

async function withMockedQueries(mockQuery, run) {
  const originalQuery = pool.query;
  pool.query = mockQuery;
  try {
    await run();
  } finally {
    pool.query = originalQuery;
  }
}

test("builds account facts from stored balance and recorded transaction types", async () => {
  const responses = [
    [[{ id: 11, name: "Main Checking", type: "checking", balance: "765.03" }], []],
    [
      [
        { type: "expense", amount: "10.00", account_id: 11, to_account_id: null },
        { type: "income", amount: "30.00", account_id: 11, to_account_id: null },
        { type: "transfer", amount: "7.00", account_id: 11, to_account_id: 22 },
        { type: "transfer", amount: "5.00", account_id: 22, to_account_id: 11 },
        { type: "savings", amount: "3.00", account_id: 11, to_account_id: null },
      ],
      [],
    ],
  ];

  await withMockedQueries(async (_sql, params) => {
    if (responses.length === 2) assert.deepEqual(params, [11, 42]);
    else assert.deepEqual(params, [42, 11, 11]);
    return responses.shift();
  }, async () => {
    const facts = await buildAccountFacts(42, 11);
    assert.equal(facts.current_balance, "$765.03");
    assert.equal(facts.expenses, "$10.00");
    assert.equal(facts.income, "$30.00");
    assert.equal(facts.transfers_in, "$5.00");
    assert.equal(facts.transfers_out, "$7.00");
    assert.equal(facts.savings_contributions, "$3.00");
    assert.equal(facts.net_recorded_activity, "$15.00");
    assert.equal(facts.amount_before_tracked_activity, "$750.03");
  });
});

test("calculates amount before tracked activity from current balance and recorded net", async () => {
  const responses = [
    [[{ id: 11, name: "Main Checking", type: "checking", balance: "740.03" }], []],
    [[{ type: "expense", amount: "10.00", account_id: 11, to_account_id: null }], []],
    [[{ id: 11, name: "Main Checking", type: "checking", balance: "735.03" }], []],
    [[{ type: "expense", amount: "15.00", account_id: 11, to_account_id: null }], []],
  ];

  await withMockedQueries(async () => responses.shift(), async () => {
    const afterExpense = await buildAccountFacts(42, 11);
    assert.equal(afterExpense.current_balance, "$740.03");
    assert.equal(afterExpense.amount_before_tracked_activity, "$750.03");
    assert.match(factsAsPlainText("account_balance", afterExpense), /Amount before tracked activity: \$750\.03/);

    const afterEdit = await buildAccountFacts(42, 11);
    assert.equal(afterEdit.current_balance, "$735.03");
    assert.equal(afterEdit.amount_before_tracked_activity, "$750.03");
  });
});

test("does not show a zero amount before tracked activity", async () => {
  const facts = {
    account_name: "Main Checking",
    current_balance: "$10.00",
    income: "$0.00",
    transfers_in: "$0.00",
    expenses: "$10.00",
    transfers_out: "$0.00",
    savings_contributions: "$0.00",
    net_recorded_activity: "-$10.00",
    amount_before_tracked_activity: "$0.00",
  };
  assert.doesNotMatch(
    factsAsPlainText("account_balance", facts),
    /amount before tracked activity/i,
  );
  assert.throws(
    () =>
      checkExplanationNumbers(
        "The starting balance was $0.00, followed by a $10.00 expense.",
        facts,
        "account_balance",
      ),
    /zero amount before tracked activity/,
  );
});

test("builds budget facts using the current-month budget progress query", async () => {
  await withMockedQueries(async (sql, params) => {
    assert.match(sql, /DATE_FORMAT\(CURDATE\(\), '%Y-%m-01'\)/);
    assert.match(sql, /type = 'expense'/);
    assert.deepEqual(params, [42, 42, 7]);
    return [[{
      id: 7,
      category_name: "Dining Out",
      monthly_limit: "100.00",
      spent: "125.50",
    }], []];
  }, async () => {
    const facts = await buildBudgetFacts(42, 7);
    assert.deepEqual(facts, {
      category: "Dining Out",
      monthly_limit: "$100.00",
      spent: "$125.50",
      status: "over",
      amount_over_budget: "$25.50",
    });
  });
});

test("normalizes number formatting while rejecting a different amount", () => {
  const exactAmount = { balance: "$750.03" };
  assert.equal(checkExplanationNumbers("Balance: 750.03,", exactAmount), "Balance: 750.03,");
  assert.equal(checkExplanationNumbers("Balance: $750.03,", exactAmount), "Balance: $750.03,");
  assert.equal(
    checkExplanationNumbers("Balance: 750", { balance: "$750.00" }),
    "Balance: 750",
  );
  assert.equal(
    checkExplanationNumbers("Balance: $1,250.00.", { balance: "$1250.00" }),
    "Balance: $1,250.00.",
  );
  assert.equal(
    checkExplanationNumbers("Balance: 750.004", { balance: "$750.00" }),
    "Balance: 750.004",
  );
  assert.throws(
    () => checkExplanationNumbers("Balance: 750.03", { balance: "$750.00" }),
    /number not in the facts/,
  );
  assert.throws(
    () => checkExplanationNumbers("Balance: 750.005", { balance: "$750.00" }),
    /number not in the facts/,
  );
});

test("returns plain-text facts when Gemini uses a made-up number", async () => {
  const facts = {
    category: "Dining Out",
    monthly_limit: "$100.00",
    spent: "$125.50",
    status: "over",
    amount_over_budget: "$25.50",
  };
  const result = await explainFacts("budget", facts, async () => "You spent $999.00.");
  assert.equal(result.source, "facts");
  assert.equal(result.explanation, factsAsPlainText("budget", facts));
  assert.match(result.explanation, /\$125\.50/);
  assert.match(result.explanation, /\$25\.50/);
});

test("returns plain-text facts when Gemini fails", async () => {
  const facts = {
    category: "Dining Out",
    monthly_limit: "$100.00",
    spent: "$125.50",
    status: "over",
    amount_over_budget: "$25.50",
  };
  const result = await explainFacts("budget", facts, async () => {
    throw new Error("Gemini unavailable");
  });
  assert.equal(result.source, "facts");
  assert.equal(result.explanation, factsAsPlainText("budget", facts));
});

test("uses the authenticated user id instead of a request-body user id", async () => {
  const originalQuery = pool.query;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const calls = [];
  process.env.GEMINI_API_KEY = "";
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM accounts")) {
      return [[{
        id: 11,
        name: "Main Checking",
        type: "checking",
        balance: "10.00",
      }], []];
    }
    return [[], []];
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 42 };
    next();
  });
  app.use("/api/explanations", explanationsRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/explanations/account-balance`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account_id: 11, user_id: 999 }),
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map((call) => call.params), [
      [11, 42],
      [42, 11, 11],
    ]);
    assert.equal((await response.json()).source, "facts");
  } finally {
    pool.query = originalQuery;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
