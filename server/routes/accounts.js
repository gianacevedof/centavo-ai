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

export default router;
