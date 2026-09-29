import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [rows] = await pool.query("SELECT * FROM accounts WHERE user_id = ?", [user_id]);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Account fetch error:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.post("/", async (req, res) => {
  const { user_id, name, type, balance } = req.body;

  if (!user_id || !name || !type) {
    return res
      .status(400)
      .json({ error: "user_id, name, and type are required" });
  }

  const validTypes = ["checking", "savings", "credit_card", "cash"];
  if (!validTypes.includes(type)) {
    return res
      .status(400)
      .json({ error: `type must be one of: ${validTypes.join(", ")}` });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
      [user_id, name, type, balance ?? 0.0],
    );
    res
      .status(201)
      .json({
        id: result.insertId,
        user_id,
        name,
        type,
        balance: balance ?? 0.0,
      });
  } catch (err) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

export default router;
