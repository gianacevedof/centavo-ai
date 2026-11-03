import express from "express";
import { buildTrends } from "../services/trends.js";

const router = express.Router();

// GET /api/trends?months=6
// Everything the Trends page shows. The numbers are calculated in services/trends.js.
router.get("/", async (req, res) => {
  try {
    const months = req.query.months === undefined ? 6 : parseInt(req.query.months, 10);
    if (!Number.isInteger(months) || months < 2 || months > 12) {
      return res.status(400).json({ error: "months must be a whole number from 2 to 12" });
    }
    res.status(200).json(await buildTrends(req.user.id, months));
  } catch (err) {
    console.error("Trends error:", err);
    res.status(500).json({ error: "Failed to build trends" });
  }
});

export default router;
