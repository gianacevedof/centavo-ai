import express from "express";
import { parseTransaction } from "../services/gemini.js";

const router = express.Router();

router.post("/parse", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required for parsing" });
  }

  try {
    const structuredData = await parseTransaction(text);
    res.status(200).json(structuredData);
  } catch (err) {
    console.error("AI Parse Route Error:", err);
    res.status(500).json({ error: "Failed to parse transaction text" });
  }
});

export default router;
