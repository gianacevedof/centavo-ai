import express from "express";
import pool from "../db.js";

const router = express.Router();

const VALID_TYPES = ["expense", "income", "transfer"];

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

router.post("/", async (req, res) => {
  const user_id = req.user.id;
  const {
    account_id,
    to_account_id,
    category_id,
    type,
    amount,
    date,
    note,
    savings_goal_id,
    source,
    ai_input_text,
  } = req.body;

  // Where the entry came from: typed in the manual form, or confirmed from the AI chat
  const entrySource = source === "ai_text" ? "ai_text" : "manual";
  const aiText =
    entrySource === "ai_text" && typeof ai_input_text === "string"
      ? ai_input_text.trim().slice(0, 2000) || null
      : null;

  if (!account_id || !type || !amount || !date) {
    return res.status(400).json({
      error: "Missing required fields: account_id, type, amount, or date",
    });
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: "Invalid transaction type" });
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "Amount must be greater than 0" });
  }

  if (type === "transfer") {
    if (!to_account_id) {
      return res
        .status(400)
        .json({ error: "to_account_id is required for transfers" });
    }
    if (Number(to_account_id) === Number(account_id)) {
      return res
        .status(400)
        .json({ error: "Transfers need two different accounts" });
    }
  }

  // Ownership checks: every ID must belong to this user
  if (!(await ownsAccount(account_id, user_id))) {
    return res.status(400).json({ error: "Invalid account" });
  }
  if (type === "transfer" && !(await ownsAccount(to_account_id, user_id))) {
    return res.status(400).json({ error: "Invalid destination account" });
  }
  if (category_id && !(await canUseCategory(category_id, user_id))) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the account rows so two requests can't both spend the same money
    const accountIds = type === "transfer" ? [account_id, to_account_id] : [account_id];
    const [accountRows] = await connection.query(
      "SELECT id, type, balance FROM accounts WHERE id IN (?) AND user_id = ? FOR UPDATE",
      [accountIds, user_id],
    );
    const accounts = new Map(accountRows.map((a) => [Number(a.id), a]));
    const source = accounts.get(Number(account_id));
    const destination =
      type === "transfer" ? accounts.get(Number(to_account_id)) : null;

    if (type === "transfer") {
      if (source.type === "credit_card") {
        await connection.rollback();
        return res
          .status(400)
          .json({ error: "Transfers can't come from a credit card" });
      }
      if (Number(source.balance) < amt) {
        await connection.rollback();
        return res.status(400).json({ error: "Insufficient funds in source account" });
      }
    }

    if (type === "expense") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange("out", amt), account_id, user_id],
      );
    } else if (type === "income") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange("in", amt), account_id, user_id],
      );
    } else if (type === "transfer") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange("out", amt), account_id, user_id],
      );
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange("in", amt), to_account_id, user_id],
      );
    }

    let transferCategoryId = null;
    if (type === "transfer") {
      const [catRows] = await connection.query(
        "SELECT id FROM categories WHERE user_id IS NULL AND name = 'Transfer' LIMIT 1",
      );
      transferCategoryId = catRows.length > 0 ? catRows[0].id : null;
    }

    const [result] = await connection.query(
      "INSERT INTO transactions (user_id, account_id, to_account_id, category_id, savings_goal_id, type, amount, date, note, source, ai_input_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user_id,
        account_id,
        type === "transfer" ? to_account_id : null,
        type === "transfer" ? transferCategoryId : category_id ?? null,
        savings_goal_id ?? null,
        type,
        amt,
        date,
        note ?? null,
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
