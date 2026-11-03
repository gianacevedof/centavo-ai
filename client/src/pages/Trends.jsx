import React, { useEffect, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

// "2026-10" -> "Oct" (chart labels) and "October 2026" (table)
function shortMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function longMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function money(n) {
  return Number(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function signedPercent(n) {
  if (n === null || n === undefined) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function Trends() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const chartRef = useRef(null);
  const chart = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await api.fetchTrends();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err.message || "Could not load trends.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Spending Over Time chart, drawn from the monthly expenses
  useEffect(() => {
    if (!data || !chartRef.current) return;

    chart.current?.destroy();
    chart.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels: data.monthly.map((m) => shortMonth(m.month)),
        datasets: [
          {
            label: "Spending",
            data: data.monthly.map((m) => m.expenses),
            fill: true,
            tension: 0.3,
          },
        ],
      },
    });

    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [data]);

  const kpis = data?.kpis;

  return (
    <Layout title="Trends" subtitle="Your spending and savings over time">
      {error && <p role="alert">{error}</p>}
      {loading && <p>Loading trends...</p>}

      {data && (
        <>
          <div>
            <section>
              <h2>Monthly Spend Average</h2>
              <p>{money(kpis.average_monthly_expenses)}</p>
              <small>Calculated over {kpis.months} months</small>
            </section>

            <section>
              <h2>Savings Rate Percentage</h2>
              <p>
                {kpis.savings_rate === null
                  ? "No income this month"
                  : `${kpis.savings_rate.toFixed(1)}%`}
              </p>
            </section>

            <section>
              <h2>Top Category of Expense</h2>
              {kpis.top_category ? (
                <>
                  <p>
                    {kpis.top_category.name} (
                    {kpis.top_category.percent.toFixed(0)}%)
                  </p>
                  <small>
                    {money(kpis.top_category.amount)} spent this month
                  </small>
                </>
              ) : (
                <p>No spending this month</p>
              )}
            </section>
          </div>

          <section>
            <h2>Spending Over Time</h2>
            <p>Monthly spending for the last {kpis.months} months</p>
            <canvas ref={chartRef} />
          </section>

          <div>
            <section>
              <h2>Category Spend Breakdown</h2>
              {data.category_breakdown.length === 0 ? (
                <p>No spending this month.</p>
              ) : (
                <ul>
                  {data.category_breakdown.map((c) => (
                    <li key={c.name}>
                      <p>
                        <span>{c.name}</span>{" "}
                        <span>
                          {money(c.amount)} ({c.percent.toFixed(0)}%)
                        </span>
                      </p>
                      <progress value={c.percent} max="100" />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2>Month-over-Month</h2>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Spend Amount</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.month_over_month.map((m) => (
                    <tr key={m.month}>
                      <td>{longMonth(m.month)}</td>
                      <td>{money(m.expenses)}</td>
                      <td>{signedPercent(m.change_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </Layout>
  );
}

export default Trends;
