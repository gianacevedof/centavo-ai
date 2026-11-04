import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET /api/budgets - List the user's budgets with this month's spending
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;

    // spent = expenses in the current calendar month, per category.
    // Transfers and income are excluded: a transfer moves money between
    // the user's own accounts, it isn't spending.
    const [rows] = await pool.query(
      `SELECT b.*, c.name AS category_name, COALESCE(s.spent, 0) AS spent
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       LEFT JOIN (
         SELECT category_id, SUM(amount) AS spent
         FROM transactions
         WHERE user_id = ?
           AND type = 'expense'
           AND date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND date < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01')
         GROUP BY category_id
       ) s ON s.category_id = b.category_id
       WHERE b.user_id = ?`,
      [user_id, user_id],
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Budget fetch error:", err);
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

// POST /api/budgets - Create a new budget
router.post("/", async (req, res) => {
  const user_id = req.user.id;
  const { category_id } = req.body;
  const limit = Number(req.body.monthly_limit);

  // Number("") and Number(null) are 0, so empty input is rejected too.
  if (
    !category_id ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    limit > 9999999999.99 // DECIMAL(12,2) max
  ) {
    return res.status(400).json({
      error: "category_id and a monthly_limit greater than 0 are required",
    });
  }

  try {
    const [cats] = await pool.query(
      "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
      [category_id, user_id],
    );
    if (cats.length === 0) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const [result] = await pool.query(
      "INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, ?, ?)",
      [user_id, category_id, limit],
    );
    res.status(201).json({
      message: "Budget created successfully",
      budgetId: result.insertId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "A budget already exists for this category" });
    }
    console.error("Budget creation error:", err);
    res.status(500).json({ error: "Failed to create budget" });
  }
});

// PATCH /api/budgets/:id - Update budget limit
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const { monthly_limit } = req.body;

  if (!monthly_limit) {
    return res.status(400).json({ error: "monthly_limit is required" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE budgets SET monthly_limit = ? WHERE id = ? AND user_id = ?",
      [monthly_limit, id, user_id],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Budget not found or unauthorized" });
    }

    res.status(200).json({ message: "Budget updated successfully" });
  } catch (err) {
    console.error("Budget update error:", err);
    res.status(500).json({ error: "Failed to update budget" });
  }
});

// DELETE /api/budgets/:id - Remove a budget
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    const [result] = await pool.query(
      "DELETE FROM budgets WHERE id = ? AND user_id = ?",
      [id, user_id],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Budget not found or unauthorized" });
    }

    res.status(200).json({ message: "Budget deleted successfully" });
  } catch (err) {
    console.error("Budget deletion error:", err);
    res.status(500).json({ error: "Failed to delete budget" });
  }
});

export default router;
