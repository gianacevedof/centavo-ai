// services/report.js
// A read-only HTML report for one period. Plain HTML: no scripts, no styling
// (the design pass adds that later). Every number is calculated here.
import pool from "../db.js";

const money = (n) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Escapes text the user typed (notes, names) before it goes into HTML
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TYPE_LABEL = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  savings: "Savings",
};

export async function buildReportHtml(userId, from, to) {
  const [totals] = await pool.query(
    `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM transactions
     WHERE user_id = ? AND date BETWEEN ? AND ?
     GROUP BY type`,
    [userId, from, to],
  );
  const byType = Object.fromEntries(
    totals.map((t) => [
      t.type,
      { total: Number(t.total), count: Number(t.count) },
    ]),
  );
  const income = byType.income?.total ?? 0;
  const expenses = byType.expense?.total ?? 0;
  const saved = byType.savings?.total ?? 0;

  const [categories] = await pool.query(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date BETWEEN ? AND ?
     GROUP BY name
     ORDER BY total DESC`,
    [userId, from, to],
  );

  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(t.date, '%Y-%m-%d') AS date, t.type, t.amount, t.note,
            a.name AS account, ta.name AS to_account, c.name AS category, g.name AS goal
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN accounts ta ON ta.id = t.to_account_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN savings_goals g ON g.id = t.savings_goal_id
     WHERE t.user_id = ? AND t.date BETWEEN ? AND ?
     ORDER BY t.date, t.id
     LIMIT 1000`,
    [userId, from, to],
  );

  const [goals] = await pool.query(
    `SELECT name, target_amount, current_amount, DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date
     FROM savings_goals
     WHERE user_id = ?
     ORDER BY target_date, id`,
    [userId],
  );

  const categoryRows = categories
    .map((c) => `<tr><td>${esc(c.name)}</td><td>${money(c.total)}</td></tr>`)
    .join("");

  const txRows = rows
    .map((t) => {
      const where =
        t.type === "transfer"
          ? `${esc(t.account)} to ${esc(t.to_account)}`
          : t.type === "savings"
            ? `${esc(t.account)} to ${esc(t.goal)}`
            : esc(t.account);
      return `<tr><td>${esc(t.date)}</td><td>${TYPE_LABEL[t.type] ?? esc(t.type)}</td><td>${where}</td><td>${esc(t.category ?? "")}</td><td>${money(t.amount)}</td><td>${esc(t.note ?? "")}</td></tr>`;
    })
    .join("");

  const goalRows = goals
    .map((g) => {
      const target = Number(g.target_amount);
      const current = Number(g.current_amount);
      const percent =
        target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
      return `<tr><td>${esc(g.name)}</td><td>${money(current)} of ${money(target)} (${percent}%)</td><td>${esc(g.target_date)}</td></tr>`;
    })
    .join("");

  const truncated =
    rows.length === 1000
      ? "<p>This report shows the first 1,000 transactions in the period.</p>"
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Centavo AI report, ${esc(from)} to ${esc(to)}</title>
</head>
<body>
<h1>Centavo AI report</h1>
<p>Period: ${esc(from)} to ${esc(to)}</p>

<h2>Summary</h2>
<table>
<tr><th>Income</th><td>${money(income)}</td></tr>
<tr><th>Expenses</th><td>${money(expenses)}</td></tr>
<tr><th>Net (income minus expenses)</th><td>${money(income - expenses)}</td></tr>
<tr><th>Put toward savings goals</th><td>${money(saved)}</td></tr>
</table>

<h2>Spending by category</h2>
${categories.length ? `<table><tr><th>Category</th><th>Spent</th></tr>${categoryRows}</table>` : "<p>No expenses in this period.</p>"}

<h2>Savings goals</h2>
${goals.length ? `<table><tr><th>Goal</th><th>Progress</th><th>Target date</th></tr>${goalRows}</table>` : "<p>No savings goals yet.</p>"}

<h2>Transactions</h2>
${rows.length ? `<table><tr><th>Date</th><th>Type</th><th>Account</th><th>Category</th><th>Amount</th><th>Note</th></tr>${txRows}</table>` : "<p>No transactions in this period.</p>"}
${truncated}
</body>
</html>`;
}
