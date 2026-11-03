import pool from "../db.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Builds the numbers for the Trends page and the AI tips.
// Transfers are left out: they move money, they don't earn or spend it.
export async function buildTrends(userId, months) {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1); // exclusive

  // 1. Income and expenses per month across the window
  const [monthRows] = await pool.query(
    `SELECT DATE_FORMAT(t.date, '%Y-%m') AS month,
            SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS income,
            SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS expenses
     FROM transactions t
     WHERE t.user_id = ? AND t.type IN ('income', 'expense')
       AND t.date >= ? AND t.date < ?
     GROUP BY month`,
    [userId, ymd(windowStart), ymd(windowEnd)],
  );
  const totals = new Map(
    monthRows.map((r) => [r.month, { income: Number(r.income), expenses: Number(r.expenses) }]),
  );

  // Every month in the window, with 0 for months that have no transactions
  const monthly = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const t = totals.get(key) || { income: 0, expenses: 0 };
    monthly.push({
      month: key,
      income: round2(t.income),
      expenses: round2(t.expenses),
      net: round2(t.income - t.expenses),
    });
  }
  const current = monthly[monthly.length - 1];

  // 2. This month's spending by category
  const [catRows] = await pool.query(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ? AND t.type = 'expense'
       AND t.date >= ? AND t.date < ?
     GROUP BY name
     ORDER BY amount DESC`,
    [userId, ymd(currentStart), ymd(windowEnd)],
  );
  const categoryTotal = catRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const categories = catRows.map((r) => {
    const amount = Number(r.amount);
    return {
      name: r.name,
      amount: round2(amount),
      percent: categoryTotal > 0 ? round1((amount / categoryTotal) * 100) : 0,
    };
  });

  // 3. Month-over-month change in spending (newest month first, last 3 months)
  const monthOverMonth = monthly
    .map((m, i) => {
      const prev = monthly[i - 1];
      const change =
        !prev || prev.expenses === 0
          ? null
          : round1(((m.expenses - prev.expenses) / prev.expenses) * 100);
      return { month: m.month, expenses: m.expenses, change_percent: change };
    })
    .slice(-3)
    .reverse();

  const averageExpenses = round2(
    monthly.reduce((sum, m) => sum + m.expenses, 0) / months,
  );

  return {
    current_month: current.month,
    monthly,
    kpis: {
      months,
      average_monthly_expenses: averageExpenses,
      savings_rate: current.income > 0 ? round1((current.net / current.income) * 100) : null,
      top_category: categories[0] ?? null,
    },
    category_breakdown: categories,
    month_over_month: monthOverMonth,
  };
}
