import express from "express";
import pool from "../db.js";

const router = express.Router();

const VALID_TYPES = ["expense", "income", "transfer"];

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

// Balance rules:
// - Checking, savings, cash: balance is money you have.
// - Credit card: balance is money you owe.
// So money leaving a card adds to what you owe, and money arriving on a card reduces it.
// direction: "out" = money leaves the account, "in" = money arrives in the account.
function balanceChange(accountType, direction, amount) {
  const leavesHoldings = direction === "out";
  if (accountType === "credit_card") {
    return leavesHoldings ? amount : -amount;
  }
  return leavesHoldings ? -amount : amount;
}

router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;
    const { category, account, limit } = req.query;

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
  } = req.body;

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
        [balanceChange(source.type, "out", amt), account_id, user_id],
      );
    } else if (type === "income") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange(source.type, "in", amt), account_id, user_id],
      );
    } else if (type === "transfer") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange(source.type, "out", amt), account_id, user_id],
      );
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [balanceChange(destination.type, "in", amt), to_account_id, user_id],
      );
    }

    const [result] = await connection.query(
      "INSERT INTO transactions (user_id, account_id, to_account_id, category_id, savings_goal_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user_id,
        account_id,
        type === "transfer" ? to_account_id : null,
        type === "transfer" ? null : category_id ?? null,
        savings_goal_id ?? null,
        type,
        amt,
        date,
        note ?? null,
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

export default router;
