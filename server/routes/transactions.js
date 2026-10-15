import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;
    const { category, account, limit } = req.query;

    let query = "SELECT * FROM transactions";
    let queryParams = [];
    let whereClauses = ["user_id = ?"];
    queryParams.push(user_id);

    if (category) {
      whereClauses.push("category_id = ?");
      queryParams.push(category);
    }

    if (account) {
      whereClauses.push("account_id = ?");
      queryParams.push(account);
    }

    query += " WHERE " + whereClauses.join(" AND ");
    query += " ORDER BY date DESC";

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
    return res
      .status(400)
      .json({
        error: "Missing required fields: account_id, type, amount, or date",
      });
  }

  if (type === "transfer" && !to_account_id) {
    return res
      .status(400)
      .json({ error: "to_account_id is required for transfers" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (type === "expense") {
      await connection.query(
        "UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?",
        [amount, account_id, user_id],
      );
    } else if (type === "income") {
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [amount, account_id, user_id],
      );
    } else if (type === "transfer") {
      await connection.query(
        "UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?",
        [amount, account_id, user_id],
      );
      await connection.query(
        "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
        [amount, to_account_id, user_id],
      );
    }

    const [result] = await connection.query(
      "INSERT INTO transactions (user_id, account_id, to_account_id, category_id, savings_goal_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user_id,
        account_id,
        to_account_id,
        category_id,
        savings_goal_id,
        type,
        amount,
        date,
        note,
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
