import express from "express";
import { sendError } from "../utils/errors.js";
import {
  buildAccountFacts,
  buildBudgetFacts,
  explainFacts,
} from "../services/explanations.js";

const router = express.Router();

router.post("/account-balance", async (req, res) => {
  const accountId = Number(req.body?.account_id);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return sendError(res, 400, "A valid account_id is required.");
  }

  try {
    const facts = await buildAccountFacts(req.user.id, accountId);
    if (!facts) return sendError(res, 404, "Account not found.");
    res.status(200).json(await explainFacts("account_balance", facts));
  } catch (error) {
    console.error("Account explanation error:", error);
    sendError(res, 500, "Could not explain this account balance.");
  }
});

router.post("/budget", async (req, res) => {
  const budgetId = Number(req.body?.budget_id);
  if (!Number.isSafeInteger(budgetId) || budgetId <= 0) {
    return sendError(res, 400, "A valid budget_id is required.");
  }

  try {
    const facts = await buildBudgetFacts(req.user.id, budgetId);
    if (!facts) return sendError(res, 404, "Budget not found.");
    if (facts.status === "at_limit") {
      return sendError(res, 400, "Explanations are available for over- or under-budget categories.");
    }
    res.status(200).json(await explainFacts("budget", facts));
  } catch (error) {
    console.error("Budget explanation error:", error);
    sendError(res, 500, "Could not explain this budget.");
  }
});

export default router;
