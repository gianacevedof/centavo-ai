import express from "express";
import pool from "../db.js";

const router = express.Router();

// GET /api/categories
// Defaults (user_id IS NULL) plus this user's custom categories only.
router.get("/", async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT id, name, is_default
       FROM categories
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY is_default DESC, name ASC`,
      [userId],
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Categories fetch error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/categories   body: { name }
router.post("/", async (req, res) => {
  const userId = req.user.id;
  const name = (req.body.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Category name is required" });
  }
  if (name.length > 100) {
    return res.status(400).json({ error: "Category name is too long" });
  }

  try {
    const [dupes] = await pool.query(
      `SELECT id FROM categories
       WHERE LOWER(name) = LOWER(?) AND (user_id IS NULL OR user_id = ?)`,
      [name, userId],
    );
    if (dupes.length > 0) {
      return res
        .status(409)
        .json({ error: "A category with that name already exists" });
    }

    const [result] = await pool.query(
      "INSERT INTO categories (user_id, name, is_default) VALUES (?, ?, FALSE)",
      [userId, name],
    );
    res.status(201).json({ id: result.insertId, name, is_default: false });
  } catch (err) {
    console.error("Category create error:", err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// DELETE /api/categories/:id
// No body: if the category is in use, returns 409 with counts.
// Body { "reassign_to": <id> }: moves transactions to that category, then deletes.
// Body { "reassign_to": null }: moves transactions to uncategorized, then deletes.
// Budgets for this category are removed (they can't be moved).
router.delete("/:id", async (req, res) => {
  const userId = req.user.id;
  const categoryId = Number(req.params.id);
  const body = req.body || {};
  const hasReassign = Object.prototype.hasOwnProperty.call(body, "reassign_to");
  const reassignTo = body.reassign_to;

  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ error: "Invalid category id" });
  }
  if (hasReassign && reassignTo !== null && !Number.isInteger(reassignTo)) {
    return res.status(400).json({ error: "Invalid category to reassign to" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Only the user's own custom categories. Defaults have user_id NULL, so they 404 here.
    const [owned] = await connection.query(
      "SELECT id FROM categories WHERE id = ? AND user_id = ? FOR UPDATE",
      [categoryId, userId],
    );
    if (owned.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Category not found" });
    }

    const [txRows] = await connection.query(
      "SELECT COUNT(*) AS count FROM transactions WHERE category_id = ? AND user_id = ?",
      [categoryId, userId],
    );
    const [bgRows] = await connection.query(
      "SELECT COUNT(*) AS count FROM budgets WHERE category_id = ? AND user_id = ?",
      [categoryId, userId],
    );
    const txCount = txRows[0].count;
    const bgCount = bgRows[0].count;
    let budgetResult = "none";

    // In use and no decision from the user yet: ask the client to show the menu.
    if ((txCount > 0 || bgCount > 0) && !hasReassign) {
      await connection.rollback();
      return res.status(409).json({
        error: "Category is in use",
        transactions: txCount,
        budgets: bgCount,
      });
    }

    // If a target category was chosen, it must be a default or this user's own, and not the one being deleted.
    if (hasReassign && reassignTo !== null) {
      if (reassignTo === categoryId) {
        await connection.rollback();
        return res
          .status(400)
          .json({ error: "Invalid category to reassign to" });
      }
      const [target] = await connection.query(
        "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)",
        [reassignTo, userId],
      );
      if (target.length === 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ error: "Invalid category to reassign to" });
      }
    }

    if (txCount > 0) {
      await connection.query(
        "UPDATE transactions SET category_id = ? WHERE category_id = ? AND user_id = ?",
        [hasReassign ? reassignTo : null, categoryId, userId],
      );
    }

    if (bgCount > 0) {
      const targetId = hasReassign ? reassignTo : null;
      let moved = false;

      // Budget can move only if the target has no budget yet (unique user+category).
      if (targetId !== null) {
        const [existing] = await connection.query(
          "SELECT id FROM budgets WHERE category_id = ? AND user_id = ?",
          [targetId, userId],
        );
        if (existing.length === 0) {
          await connection.query(
            "UPDATE budgets SET category_id = ? WHERE category_id = ? AND user_id = ?",
            [targetId, categoryId, userId],
          );
          moved = true;
        }
      }

      if (!moved) {
        await connection.query(
          "DELETE FROM budgets WHERE category_id = ? AND user_id = ?",
          [categoryId, userId],
        );
      }
      budgetResult = moved ? "moved" : "removed";
    }

    await connection.query(
      "DELETE FROM categories WHERE id = ? AND user_id = ?",
      [categoryId, userId],
    );

    await connection.commit();
    res.status(200).json({
      deleted: categoryId,
      transactions_moved: txCount,
      budgets: budgetResult, // "moved", "removed", or "none"
    });
  } catch (err) {
    await connection.rollback();
    console.error("Category delete error:", err);
    res.status(500).json({ error: "Failed to delete category" });
  } finally {
    connection.release();
  }
});

export default router;
