import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM accounts");
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

export default router;
