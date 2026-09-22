import express from "express";
import cors from "cors";
import pool from "./db.js";
import accountsRoutes from "./routes/accounts.js";
import transactionsRoutes from "./routes/transactions.js";
import budgetsRoutes from "./routes/budgets.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/accounts", accountsRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/budgets", budgetsRoutes);

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
