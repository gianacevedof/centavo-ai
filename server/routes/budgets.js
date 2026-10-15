import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET /api/budgets - List all budgets for the logged-in user
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;

    const [rows] = await pool.query(
      "SELECT b.*, c.name as category_name FROM budgets b JOIN categories c ON b.category_id = c.id WHERE b.user_id = ?",
      [user_id],
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
  const { category_id, monthly_limit } = req.body;

  if (!category_id || !monthly_limit) {
    return res
      .status(400)
      .json({ error: "category_id and monthly_limit are required" });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, ?, ?)",
      [user_id, category_id, monthly_limit],
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
