import express from "express";
import pool from "../db.js";

const router = express.Router();

const VALID_TYPES = ["expense", "income", "transfer", "savings"];

// Checks that the savings goal belongs to this user
async function ownsGoal(goalId, userId) {
  const [rows] = await pool.query(
    "SELECT id FROM savings_goals WHERE id = ? AND user_id = ?",
    [goalId, userId],
  );
  return rows.length > 0;
}

// Accepts only a real calendar day written as YYYY-MM-DD
function isValidDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Checks that the account belongs to this user
async function ownsAccount(accountId, userId) {
  const [rows] = await pool.query(
    "SELECT id FROM accounts WHERE id = ? AND user_id = ?",
    [accountId, userId],
  );
  return rows.length > 0;
}

// Checks that the category is a default (user_id NULL) or belongs to this user
async function canUseCategory(categoryId, userId) {
  const [rows] = await pool.query(
    "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
    [categoryId, userId],
  );
  return rows.length > 0;
}

// Balance rules (same for every account type):
// - Checking, savings, cash: positive balance = money you have.
// - Credit card: negative balance = money you owe (e.g. -1240 = you owe 1240).
// direction: "out" = money leaves the account, "in" = money arrives in the account.
function balanceChange(direction, amount) {
  return direction === "out" ? -amount : amount;
}

// Checks the request body. Returns { error } or { values } with cleaned fields.
async function validateTransaction(body, userId) {
  const {
    account_id,
    to_account_id,
    category_id,
    type,
    amount,
    date,
    note,
    savings_goal_id,
  } = body;

  if (!account_id || !type || !amount || !date) {
    return { error: "Missing required fields: account_id, type, amount, or date" };
  }
  if (!VALID_TYPES.includes(type)) {
    return { error: "Invalid transaction type" };
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { error: "Amount must be greater than 0" };
  }
  if (!isValidDay(date)) {
    return { error: "Date must look like YYYY-MM-DD" };
  }

  if (type === "transfer") {
    if (!to_account_id) {
      return { error: "to_account_id is required for transfers" };
    }
    if (Number(to_account_id) === Number(account_id)) {
      return { error: "Transfers need two different accounts" };
    }
  }

  if (type === "savings") {
    if (!savings_goal_id) {
      return { error: "savings_goal_id is required for savings" };
    }
    if (!(await ownsGoal(savings_goal_id, userId))) {
      return { error: "Invalid savings goal" };
    }
  }

  // Ownership checks: every ID must belong to this user
  if (!(await ownsAccount(account_id, userId))) {
    return { error: "Invalid account" };
  }
  if (type === "transfer" && !(await ownsAccount(to_account_id, userId))) {
    return { error: "Invalid destination account" };
  }
  if (category_id && !(await canUseCategory(category_id, userId))) {
    return { error: "Invalid category" };
  }

  return {
    values: {
      account_id: Number(account_id),
      to_account_id: type === "transfer" ? Number(to_account_id) : null,
      category_id: category_id ?? null,
      savings_goal_id: type === "savings" ? Number(savings_goal_id) : null,
      type,
      amt,
      date,
      note: note ?? null,
    },
  };
}

// Moves money for a transaction. Returns an error message, or null if it worked.
// Must run inside a DB transaction; locks the account rows it touches.
async function applyEffects(connection, v, userId) {
  const accountIds = v.type === "transfer" ? [v.account_id, v.to_account_id] : [v.account_id];
  const [rows] = await connection.query(
    "SELECT id, type, balance FROM accounts WHERE id IN (?) AND user_id = ? FOR UPDATE",
    [accountIds, userId],
  );
  const accounts = new Map(rows.map((a) => [Number(a.id), a]));
  const source = accounts.get(v.account_id);
  if (!source) return "Invalid account";

  const adjust = (accountId, change) =>
    connection.query(
      "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
      [change, accountId, userId],
    );

  if (v.type === "transfer") {
    if (!accounts.get(v.to_account_id)) return "Invalid destination account";
    if (source.type === "credit_card") return "Transfers can't come from a credit card";
    if (Number(source.balance) < v.amt) return "Insufficient funds in source account";
    await adjust(v.account_id, balanceChange("out", v.amt));
    await adjust(v.to_account_id, balanceChange("in", v.amt));
  } else if (v.type === "expense") {
    await adjust(v.account_id, balanceChange("out", v.amt));
  } else if (v.type === "income") {
    await adjust(v.account_id, balanceChange("in", v.amt));
  } else if (v.type === "savings") {
    if (source.type === "credit_card") {
      return "Savings contributions can't come from a credit card";
    }
    if (Number(source.balance) < v.amt) return "Insufficient funds in source account";
    await adjust(v.account_id, balanceChange("out", v.amt));
    await connection.query(
      "UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?",
      [v.amt, v.savings_goal_id, userId],
    );
  }
  return null;
}

// Undoes the money movement of a saved transaction. Used by edit and delete.
async function reverseEffects(connection, tx, userId) {
  const amt = Number(tx.amount);
  const adjust = (accountId, change) =>
    connection.query(
      "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
      [change, accountId, userId],
    );

  if (tx.type === "expense") {
    await adjust(tx.account_id, balanceChange("in", amt));
  } else if (tx.type === "income") {
    await adjust(tx.account_id, balanceChange("out", amt));
  } else if (tx.type === "transfer") {
    await adjust(tx.account_id, balanceChange("in", amt));
    await adjust(tx.to_account_id, balanceChange("out", amt));
  } else if (tx.type === "savings") {
    await adjust(tx.account_id, balanceChange("in", amt));
    await connection.query(
      "UPDATE savings_goals SET current_amount = current_amount - ? WHERE id = ? AND user_id = ?",
      [amt, tx.savings_goal_id, userId],
    );
  }
}

// Transfers are stored under the built-in "Transfer" category
async function transferCategoryId(connection) {
  const [rows] = await connection.query(
    "SELECT id FROM categories WHERE user_id IS NULL AND name = 'Transfer' LIMIT 1",
  );
  return rows.length > 0 ? rows[0].id : null;
}

router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;
    const { category, account, limit, from, to } = req.query;

    if ((from && !isValidDay(from)) || (to && !isValidDay(to))) {
      return res.status(400).json({ error: "Dates must look like YYYY-MM-DD" });
    }
    if (from && to && from > to) {
      return res.status(400).json({ error: "'from' must be on or before 'to'" });
    }

    let query = `
      SELECT t.*, c.name AS category_name, a.name AS account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
    `;
    let queryParams = [];
    let whereClauses = ["t.user_id = ?"];
    queryParams.push(user_id);

    if (category) {
      whereClauses.push("t.category_id = ?");
      queryParams.push(category);
    }

    if (account) {
      whereClauses.push("t.account_id = ?");
      queryParams.push(account);
    }

    // Both ends are inclusive. "to" uses < next day so a DATETIME column still matches the whole last day
    if (from) {
      whereClauses.push("t.date >= ?");
      queryParams.push(from);
    }
    if (to) {
      whereClauses.push("t.date < DATE_ADD(?, INTERVAL 1 DAY)");
      queryParams.push(to);
    }

    query += " WHERE " + whereClauses.join(" AND ");
    query += " ORDER BY t.date DESC";

    if (limit) {
      query += " LIMIT ?";
      queryParams.push(parseInt(limit));
    }

    const [rows] = await pool.query(query, queryParams);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Transaction fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// POST /api/transactions - Create a transaction (expense, income, transfer, or savings)
router.post("/", async (req, res) => {
  const user_id = req.user.id;
  const entrySource = req.body.source === "ai_text" ? "ai_text" : "manual";
  const aiText =
    entrySource === "ai_text" && typeof req.body.ai_input_text === "string"
      ? req.body.ai_input_text.trim().slice(0, 2000) || null
      : null;

  const checked = await validateTransaction(req.body, user_id);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const v = checked.values;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const problem = await applyEffects(connection, v, user_id);
    if (problem) {
      await connection.rollback();
      return res.status(400).json({ error: problem });
    }

    const categoryForRow =
      v.type === "transfer"
        ? await transferCategoryId(connection)
        : v.type === "savings"
          ? null
          : v.category_id;

    const [result] = await connection.query(
      "INSERT INTO transactions (user_id, account_id, to_account_id, category_id, savings_goal_id, type, amount, date, note, source, ai_input_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user_id,
        v.account_id,
        v.to_account_id,
        categoryForRow,
        v.savings_goal_id,
        v.type,
        v.amt,
        v.date,
        v.note,
        entrySource,
        aiText,
      ],
    );

    await connection.commit();
    res.status(201).json({
      message: "Transaction recorded successfully",
      transactionId: result.insertId,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Transaction creation error:", err);
    res.status(500).json({ error: "Failed to process transaction" });
  } finally {
    connection.release();
  }
});

// PUT /api/transactions/:id - Replace a transaction's details.
// The old money movement is undone first, then the new one is applied.
router.put("/:id", async (req, res) => {
  const user_id = req.user.id;
  const txId = Number(req.params.id);
  if (!Number.isInteger(txId)) {
    return res.status(400).json({ error: "Invalid transaction id" });
  }

  const checked = await validateTransaction(req.body, user_id);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const v = checked.values;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query(
      "SELECT * FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE",
      [txId, user_id],
    );
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Transaction not found" });
    }

    await reverseEffects(connection, oldRows[0], user_id);

    const problem = await applyEffects(connection, v, user_id);
    if (problem) {
      await connection.rollback();
      return res.status(400).json({ error: problem });
    }

    const categoryForRow =
      v.type === "transfer"
        ? await transferCategoryId(connection)
        : v.type === "savings"
          ? null
          : v.category_id;

    await connection.query(
      `UPDATE transactions
       SET account_id = ?, to_account_id = ?, category_id = ?, savings_goal_id = ?,
           type = ?, amount = ?, date = ?, note = ?
       WHERE id = ? AND user_id = ?`,
      [
        v.account_id,
        v.to_account_id,
        categoryForRow,
        v.savings_goal_id,
        v.type,
        v.amt,
        v.date,
        v.note,
        txId,
        user_id,
      ],
    );

    await connection.commit();
    res.status(200).json({ message: "Transaction updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Transaction update error:", err);
    res.status(500).json({ error: "Failed to update transaction" });
  } finally {
    connection.release();
  }
});

// DELETE /api/transactions/:id - Remove a transaction and undo its money movement
router.delete("/:id", async (req, res) => {
  const user_id = req.user.id;
  const txId = Number(req.params.id);
  if (!Number.isInteger(txId)) {
    return res.status(400).json({ error: "Invalid transaction id" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT * FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE",
      [txId, user_id],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Transaction not found" });
    }

    await reverseEffects(connection, rows[0], user_id);
    await connection.query(
      "DELETE FROM transactions WHERE id = ? AND user_id = ?",
      [txId, user_id],
    );

    await connection.commit();
    res.status(200).json({ message: "Transaction deleted successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Transaction delete error:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  } finally {
    connection.release();
  }
});

// GET /api/transactions/summary?period=monthly  -> { period, months: [...] }
// GET /api/transactions/summary?period=quarterly -> { period, quarters: [...] }
// Income, expenses and net per period. Transfers are left out: they move money, they don't earn or spend it.
router.get("/summary", async (req, res) => {
  try {
    const user_id = req.user.id;
    const { period } = req.query;

    if (period !== "monthly" && period !== "quarterly") {
      return res.status(400).json({ error: "period must be monthly or quarterly" });
    }

    const quarterly = period === "quarterly";
    const bucketSql = quarterly
      ? "CONCAT(YEAR(t.date), '-Q', QUARTER(t.date))"
      : "DATE_FORMAT(t.date, '%Y-%m')";

    const [rows] = await pool.query(
      `SELECT ${bucketSql} AS bucket,
              SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS income,
              SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS expenses,
              COUNT(*) AS transaction_count
       FROM transactions t
       WHERE t.user_id = ? AND t.type IN ('income', 'expense')
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [user_id],
    );

    const items = rows.map((r) => {
      const income = Number(r.income);
      const expenses = Number(r.expenses);
      const item = {
        income,
        expenses,
        net: Number((income - expenses).toFixed(2)),
        transaction_count: Number(r.transaction_count),
      };
      return quarterly ? { quarter: r.bucket, ...item } : { month: r.bucket, ...item };
    });

    res.status(200).json(
      quarterly ? { period, quarters: items } : { period, months: items },
    );
  } catch (err) {
    console.error("Transaction summary error:", err);
    res.status(500).json({ error: "Failed to build transaction summary" });
  }
});

export default router;
