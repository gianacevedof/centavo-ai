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
import Card from "../components/Card/Card";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import Skeleton from "../components/Skeleton/Skeleton";
import EmptyState from "../components/EmptyState/EmptyState";
import ChatPanel from "../components/ChatPanel/ChatPanel";
import styles from "./Trends.module.css";

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

function shortMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function longMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function money(n) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
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
    return () => { cancelled = true; };
  }, []);

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
            borderColor: "#4a7fc4",
            backgroundColor: "rgba(74, 127, 196, 0.1)",
            borderWidth: 2,
            pointRadius: 2,
            pointBackgroundColor: "#4a7fc4",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: "#e5e5e0", drawBorder: false }, ticks: { color: "#6b7280", font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { color: "#6b7280", font: { size: 11 } } },
        },
      },
    });

    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [data]);

  // SKELETON LOADING
  if (loading) {
    return (
      <Layout title="Trends" subtitle="Your spending and savings over time">
        <div className={styles.pageWrapper}>
          <div className={styles.summaryGrid}>
            {[...Array(3)].map((_, i) => (
              <Card key={i} className={styles.summaryCard}>
                <Skeleton width="120px" height="14px" />
                <Skeleton width="180px" height="32px" className={styles.mtSm} />
                <Skeleton width="150px" height="12px" className={styles.mtSm} />
              </Card>
            ))}
          </div>
          <Card className={styles.chartCard}>
            <Skeleton width="200px" height="20px" />
            <Skeleton width="100%" height="250px" className={styles.mtLg} />
          </Card>
        </div>
      </Layout>
    );
  }

  // ERROR OR NO DATA
  if (error || !data || !data.kpis) {
    return (
      <Layout title="Trends" subtitle="Your spending and savings over time">
        <EmptyState
          icon="📈"
          title="Not enough data yet"
          description="Add some transactions to see your spending and savings trends over time."
        />
      </Layout>
    );
  }

  const kpis = data.kpis;

  return (
    <Layout title="Trends" subtitle="Your spending and savings over time">
      <div className={styles.pageWrapper}>
        
        <div className={styles.summaryGrid}>
          <Card className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Monthly Spend Average</span>
            <span className={styles.summaryValue}>{money(kpis.average_monthly_expenses)}</span>
            <span className={styles.summarySub}>Calculated over {kpis.months} months</span>
          </Card>
          
          <Card className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Savings Rate Percentage</span>
            <span className={styles.summaryValue}>
              {kpis.savings_rate === null ? "—" : `${kpis.savings_rate.toFixed(1)}%`}
            </span>
            <div className={styles.savingsGoalRow}>
              {kpis.savings_rate !== null && kpis.savings_rate > 0 && (
                <span className={styles.badgeGreen}>+{kpis.savings_rate.toFixed(1)}%</span>
              )}
              <span className={styles.summarySub}>Goal target is 35%</span>
            </div>
          </Card>
          
          <Card className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Top Category of Expense</span>
            <span className={styles.summaryValue}>
              {kpis.top_category 
                ? `${kpis.top_category.name} (${kpis.top_category.percent.toFixed(0)}%)` 
                : "No spending"}
            </span>
            <span className={styles.summarySub}>
              {kpis.top_category ? `${money(kpis.top_category.amount)} spent this month` : "—"}
            </span>
          </Card>
        </div>

        <Card className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h2 className={styles.chartTitle}>Spending Over Time</h2>
              <p className={styles.chartSub}>Tracking cumulative outgoings per calendar month</p>
            </div>
            <div className={styles.legend}>
              <span className={styles.dotBlue}></span> Spending
            </div>
          </div>
          
          <div className={styles.canvasWrapper}>
            <canvas ref={chartRef} />
          </div>
        </Card>

        <div className={styles.bottomGrid}>
          <Card title="Category Spend Breakdown">
            <div className={styles.breakdownList}>
              {data.category_breakdown.length === 0 ? (
                <p className={styles.emptyState}>No spending this month.</p>
              ) : (
                data.category_breakdown.map((c, i) => (
                  <div key={c.name} className={styles.breakdownRow}>
                    <div className={styles.breakdownHeader}>
                      <span className={styles.breakdownName}>{c.name}</span>
                      <span className={styles.breakdownAmount}>{money(c.amount)} ({c.percent.toFixed(0)}%)</span>
                    </div>
                    <ProgressBar value={c.percent} max="100" tone={i === 0 ? "blue" : i === 1 ? "amber" : i === 2 ? "green" : "red"} />
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Month-over-Month">
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className={styles.textRight}>Spend Amount</th>
                    <th className={styles.textRight}>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.month_over_month.length === 0 && (
                    <tr><td colSpan="3" className={styles.emptyState}>No data yet.</td></tr>
                  )}
                  {data.month_over_month.map((m) => (
                    <tr key={m.month}>
                      <td>{longMonth(m.month)}</td>
                      <td className={styles.textRight}>{money(m.expenses)}</td>
                      <td className={`${styles.textRight} ${m.change_percent >= 0 ? styles.textGreen : styles.textRed}`}>
                        {signedPercent(m.change_percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: "var(--space-xl)" }}>
          <ChatPanel />
        </div>
      </div>
    </Layout>
  );
}

export default Trends;
