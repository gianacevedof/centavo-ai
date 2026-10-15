import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pool from "./db.js";
import accountsRoutes from "./routes/accounts.js";
import transactionsRoutes from "./routes/transactions.js";
import budgetsRoutes from "./routes/budgets.js";
import categoriesRoutes from "./routes/categories.js";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import { authMiddleware } from "./middleware/authMiddleware.js";

const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/accounts", authMiddleware, accountsRoutes);
app.use("/api/transactions", authMiddleware, transactionsRoutes);
app.use("/api/budgets", authMiddleware, budgetsRoutes);
app.use("/api/categories", authMiddleware, categoriesRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
