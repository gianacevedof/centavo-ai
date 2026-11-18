import express from "express";
import { buildReportHtml } from "../services/report.js";
import { getToday } from "../services/gemini.js";
import { sendError } from "../utils/errors.js";

const router = express.Router();

const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to the current month in the app's timezone. Replies with HTML.
router.get("/", async (req, res) => {
  let { from, to } = req.query;

  if (from === undefined && to === undefined) {
    const [y, m] = getToday().date.split("-").map(Number);
    const pad = (n) => String(n).padStart(2, "0");
    from = `${y}-${pad(m)}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    to = `${y}-${pad(m)}-${pad(last)}`;
  }

  if (!isValidDay(from) || !isValidDay(to)) {
    return sendError(res, 400, "from and to must be real dates in YYYY-MM-DD form");
  }
  if (from > to) {
    return sendError(res, 400, "from must be on or before to");
  }
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_DAYS) {
    return sendError(res, 400, `A report can cover at most ${MAX_DAYS} days`);
  }

  try {
    const html = await buildReportHtml(req.user.id, from, to);
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.status(200).send(html);
  } catch (err) {
    console.error("Report error:", err);
    sendError(res, 500, "Failed to build the report");
  }
});

export default router;
