import express from "express";
import pool from "../db.js";
import {
  parseTransaction,
  AIParseError,
  AIUnavailableError,
} from "../services/gemini.js";

const router = express.Router();

router.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required for parsing" });
  }

  try {
    // User 3 is hardcoded for now (no auth yet)
    const [accounts] = await pool.query(
      "SELECT id, name FROM accounts WHERE user_id = 3",
    );
    const [categories] = await pool.query("SELECT * FROM categories");

    const result = await parseTransaction(text, { accounts, categories });

    if (result.problems.includes("transfer_not_supported")) {
      return res.status(422).json({
        error:
          "Transfers aren't supported by the AI. Please use the manual form.",
      });
    }

    if (result.amount === null) {
      return res.status(422).json({
        error:
          "I couldn't find an amount. Try something like: spent 12 on lunch.",
        problems: result.problems,
      });
    }

    // Success: nothing is saved yet, the UI shows a confirm step
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AIParseError || err instanceof AIUnavailableError) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error("Unexpected AI parse route error:", err);
    return res
      .status(500)
      .json({ error: "Something went wrong while parsing. Try again." });
  }
});

export default router;
