import { clearAiCache } from "../services/aiCache.js";
import { sendError } from "../utils/errors.js";
import express from "express";
import pool from "../db.js";
import {
  buildBudgetOverview,
  buildBudgetProgress,
  getBudgetTips,
} from "../services/budgetOverview.js";

const router = express.Router();

// GET /api/budgets/overview - each budget with this month's progress, plus AI tips
router.get("/overview", async (req, res) => {
  try {
    const overview = await buildBudgetOverview(req.user.id);
    const tips = await getBudgetTips(req.user.id);
    res.status(200).json({ ...overview, tips });
  } catch (err) {
    console.error("Budget overview error:", err);
    sendError(res, 500, "Failed to load the budget overview");
  }
});

// GET /api/budgets - List the user's budgets with this month's spending
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.id;
    const rows = await buildBudgetProgress(user_id);
    res.status(200).json(rows);
  } catch (err) {
    console.error("Budget fetch error:", err);
    sendError(res, 500, "Failed to fetch budgets");
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
    return sendError(res, 400, "category_id and a monthly_limit greater than 0 are required");
  }

  try {
    const [cats] = await pool.query(
      "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
      [category_id, user_id],
    );
    if (cats.length === 0) {
      return sendError(res, 400, "Invalid category");
    }

    const [result] = await pool.query(
      "INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?, ?, ?)",
      [user_id, category_id, limit],
    );
    clearAiCache(user_id);
    res.status(201).json({
      message: "Budget created successfully",
      budgetId: result.insertId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "A budget already exists for this category");
    }
    console.error("Budget creation error:", err);
    sendError(res, 500, "Failed to create budget");
  }
});

// PATCH /api/budgets/:id - Update budget limit
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const { monthly_limit } = req.body;

  if (!monthly_limit) {
    return sendError(res, 400, "monthly_limit is required");
  }

  try {
    const [result] = await pool.query(
      "UPDATE budgets SET monthly_limit = ? WHERE id = ? AND user_id = ?",
      [monthly_limit, id, user_id],
    );

    if (result.affectedRows === 0) {
      return sendError(res, 404, "Budget not found or unauthorized");
    }

    clearAiCache(user_id);
    res.status(200).json({ message: "Budget updated successfully" });
  } catch (err) {
    console.error("Budget update error:", err);
    sendError(res, 500, "Failed to update budget");
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
      return sendError(res, 404, "Budget not found or unauthorized");
    }

    clearAiCache(user_id);
    res.status(200).json({ message: "Budget deleted successfully" });
  } catch (err) {
    console.error("Budget deletion error:", err);
    sendError(res, 500, "Failed to delete budget");
  }
});

export default router;
