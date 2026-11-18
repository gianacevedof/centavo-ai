import { sendError } from "../utils/errors.js";
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query("SELECT * FROM accounts WHERE user_id = ?", [userId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Account fetch error:", err);
    sendError(res, 500, "Failed to fetch accounts");
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const { name, type, balance } = req.body;
  const userId = req.user.id;

  if (!name || !type) {
    return sendError(res, 400, "name and type are required");
  }

  const validTypes = ["checking", "savings", "credit_card", "cash"];
  if (!validTypes.includes(type)) {
    return sendError(res, 400, `type must be one of: ${validTypes.join(", ")}`);
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
      [userId, name, type, balance ?? 0.0],
    );
    res
      .status(201)
      .json({
        id: result.insertId,
        user_id: userId,
        name,
        type,
        balance: balance ?? 0.0,
      });
  } catch (err) {
    sendError(res, 500, "Failed to create account");
  }
});

export default router;
