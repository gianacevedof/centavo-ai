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

// DELETE /api/goals/:id?money=return|spent
// Contributions (savings transactions) to this goal must be handled first:
// - No contributions: deleted directly.
// - Contributions exist and no ?money= given: 409 with counts, so the client can ask the user.
// - ?money=return: each contribution goes back to the account it came from, then is removed.
// - ?money=spent: contributions are removed from history; account balances stay as they are.
router.delete("/:id", async (req, res) => {
  const goalId = Number(req.params.id);
  const user_id = req.user.id;
  const mode = req.query.money;

  if (!Number.isInteger(goalId)) {
    return res.status(400).json({ error: "Invalid goal id" });
  }
  if (mode !== undefined && mode !== "return" && mode !== "spent") {
    return res.status(400).json({ error: "money must be return or spent" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [owned] = await connection.query(
      "SELECT id FROM savings_goals WHERE id = ? AND user_id = ? FOR UPDATE",
      [goalId, user_id],
    );
    if (owned.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Goal not found or unauthorized" });
    }

    const [contribs] = await connection.query(
      "SELECT id, account_id, amount FROM transactions WHERE savings_goal_id = ? AND user_id = ? AND type = 'savings' FOR UPDATE",
      [goalId, user_id],
    );

    if (contribs.length > 0 && mode === undefined) {
      await connection.rollback();
      const total = contribs.reduce((sum, c) => sum + Number(c.amount), 0);
      return res.status(409).json({
        error: "Goal has contributions",
        contributions: contribs.length,
        total: Number(total.toFixed(2)),
      });
    }

    if (mode === "return") {
      for (const c of contribs) {
        await connection.query(
          "UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?",
          [c.amount, c.account_id, user_id],
        );
      }
    }

    // Remove contributions before the goal, so the goal link is never set to NULL
    await connection.query(
      "DELETE FROM transactions WHERE savings_goal_id = ? AND user_id = ? AND type = 'savings'",
      [goalId, user_id],
    );
    await connection.query(
      "DELETE FROM savings_goals WHERE id = ? AND user_id = ?",
      [goalId, user_id],
    );

    await connection.commit();
    res.status(200).json({
      message: "Goal deleted successfully",
      contributions_removed: contribs.length,
      money: mode ?? "none",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Goal deletion error:", err);
    res.status(500).json({ error: "Failed to delete goal" });
  } finally {
    connection.release();
  }
});

export default router;
