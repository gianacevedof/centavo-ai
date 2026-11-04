import express from "express";
import pool from "../db.js";

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 9999999999.99; // DECIMAL(12,2)

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Each check returns an error message, or null when the value is fine.
function checkName(name) {
  if (typeof name !== "string" || !name.trim()) return "Goal name is required.";
  if (name.trim().length > 100)
    return "Goal name must be 100 characters or fewer.";
  return null;
}

function checkAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) {
    return "Target amount must be greater than 0.";
  }
  return null;
}

// GET /api/goals - List the user's savings goals
router.get("/", async (req, res) => {
  try {
    // DATE_FORMAT keeps target_date as a plain YYYY-MM-DD string,
    // so the browser doesn't shift the day with timezone conversion.
    const [rows] = await pool.query(
      `SELECT id, name, target_amount,
              DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
              current_amount
       FROM savings_goals
       WHERE user_id = ?
       ORDER BY target_date, id`,
      [req.user.id],
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Goal fetch error:", err);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

// POST /api/goals - Create a savings goal
router.post("/", async (req, res) => {
  const user_id = req.user.id;
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const { target_amount, target_date } = req.body;

  const error =
    checkName(name) ||
    checkAmount(target_amount) ||
    (isValidDate(target_date) ? null : "Target date must be a valid date.");
  if (error) return res.status(400).json({ error });

  try {
    const [result] = await pool.query(
      "INSERT INTO savings_goals (user_id, name, target_amount, target_date) VALUES (?, ?, ?, ?)",
      [user_id, name, Number(target_amount), target_date],
    );
    res.status(201).json({
      message: "Goal created successfully",
      goalId: result.insertId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "A goal with this name already exists" });
    }
    console.error("Goal creation error:", err);
    res.status(500).json({ error: "Failed to create goal" });
  }
});

// PATCH /api/goals/:id - Update a goal's name, target amount, or target date
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const updates = {};

  if (req.body.name !== undefined) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const error = checkName(name);
    if (error) return res.status(400).json({ error });
    updates.name = name;
  }
  if (req.body.target_amount !== undefined) {
    const error = checkAmount(req.body.target_amount);
    if (error) return res.status(400).json({ error });
    updates.target_amount = Number(req.body.target_amount);
  }
  if (req.body.target_date !== undefined) {
    if (!isValidDate(req.body.target_date)) {
      return res
        .status(400)
        .json({ error: "Target date must be a valid date." });
    }
    updates.target_date = req.body.target_date;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE savings_goals SET ? WHERE id = ? AND user_id = ?",
      [updates, id, user_id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Goal not found or unauthorized" });
    }
    res.status(200).json({ message: "Goal updated successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "A goal with this name already exists" });
    }
    console.error("Goal update error:", err);
    res.status(500).json({ error: "Failed to update goal" });
  }
});

// DELETE /api/goals/:id - Remove a goal.
// Linked transactions are kept; the schema sets their savings_goal_id to NULL.
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    const [result] = await pool.query(
      "DELETE FROM savings_goals WHERE id = ? AND user_id = ?",
      [id, user_id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Goal not found or unauthorized" });
    }
    res.status(200).json({ message: "Goal deleted successfully" });
  } catch (err) {
    console.error("Goal deletion error:", err);
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

export default router;
