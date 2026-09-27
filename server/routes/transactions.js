import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { category, account, limit } = req.query;
    
    let query = "SELECT * FROM transactions";
    let queryParams = [];
    let whereClauses = [];

    // Filter by Category
    if (category) {
      whereClauses.push("category_id = ?");
      queryParams.push(category);
    }

    // Filter by Account
    if (account) {
      whereClauses.push("account_id = ?");
      queryParams.push(account);
    }

    // Add WHERE clause if any filters exist
    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    // Order by date descending first
    query += " ORDER BY date DESC";

    // Limit must come AFTER Order By
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

export default router;
