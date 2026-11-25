import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
} from "chart.js";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import AiTips from "../components/AiTips/AiTips";
import Card from "../components/Card/Card";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import EmptyState from "../components/EmptyState/EmptyState";
import ChatPanel from "../components/ChatPanel/ChatPanel";
import styles from "./Overview.module.css";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
);

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function currentDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function capitalizeFirst(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : "User";
}

function shortMonth(ym) {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function dateAtMidnight(value) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getGoalPace(goals) {
  if (!goals?.length) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let totalTarget = 0;
  let expectedSaved = 0;
  let actualSaved = 0;

  for (const goal of goals) {
    const target = Number(goal.target_amount);
    if (!Number.isFinite(target) || target <= 0) continue;

    const created = dateAtMidnight(goal.created_at);
    const deadline = dateAtMidnight(goal.target_date);
    const duration = deadline.getTime() - created.getTime();
    const elapsed = today.getTime() - created.getTime();
    const expectedProgress =
      duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
    const actualProgress = Math.max(
      0,
      Math.min(1, Number(goal.current_amount || 0) / target),
    );

    totalTarget += target;
    expectedSaved += target * expectedProgress;
    actualSaved += target * actualProgress;
  }

  if (totalTarget === 0) return null;
  const paceDifference = ((actualSaved - expectedSaved) / totalTarget) * 100;
  if (paceDifference < -10) return "slow";
  if (paceDifference > 10) return "fast";
  return "moderate";
}

function Overview() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState(null);
  const [goalError, setGoalError] = useState("");
  const [trendData, setTrendData] = useState(null);
  const [trendError, setTrendError] = useState("");
  const trendCanvasRef = useRef(null);
  const trendChartRef = useRef(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // AUTH CHECK RESTORED
        const { user: me } = await api.fetchMe();
        setUser(me);
      } catch {
        navigate("/login");
        return;
      }

      try {
        const [accs, txs, bgs] = await Promise.all([
          api.fetchAccounts(),
          api.fetchTransactions({ limit: 3 }),
          api.fetchBudgets(),
        ]);
        setAccounts(accs);
        setTransactions(txs);
        setBudgets(bgs);
      } catch (err) {
        console.error("Overview load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchTrends()
      .then((data) => {
        if (!cancelled) setTrendData(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Overview trends load error:", err);
          setTrendError(err.message || "Could not load trends.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchSavingsGoals()
      .then((data) => {
        if (!cancelled) setGoals(data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Overview goals load error:", err);
          setGoalError(err.message || "Could not load savings goals.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!trendData?.monthly || !trendCanvasRef.current) return;

    trendChartRef.current?.destroy();
    trendChartRef.current = new Chart(trendCanvasRef.current, {
      type: "line",
      data: {
        labels: trendData.monthly.map((month) => shortMonth(month.month)),
        datasets: [
          {
            data: trendData.monthly.map((month) => month.expenses),
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
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) =>
                `$${Number(context.parsed.y).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`,
            },
          },
        },
        scales: {
          y: { display: false, beginAtZero: true },
          x: {
            grid: { display: false },
            ticks: { color: "#9ca3af", font: { size: 10 } },
          },
        },
      },
    });

    return () => {
      trendChartRef.current?.destroy();
      trendChartRef.current = null;
    };
  }, [trendData]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum + parseFloat(a.balance || 0),
    0,
  );
  const goalTarget =
    goals?.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0) || 0;
  const goalSaved =
    goals?.reduce((sum, goal) => sum + Number(goal.current_amount || 0), 0) ||
    0;
  const goalHealth =
    goalTarget > 0
      ? Math.max(0, Math.min(100, Math.round((goalSaved / goalTarget) * 100)))
      : 0;
  const goalPace = getGoalPace(goals);
  const currentMonthNet =
    trendData?.monthly?.[trendData.monthly.length - 1]?.net;

  const getCategoryColor = (name) => {
    const colors = [
      "#c4453a",
      "#2d7a5f",
      "#d99a2b",
      "#4a7fc4",
      "#6b7280",
      "#8b5cf6",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++)
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };
  const trendChange = trendData?.month_over_month?.[0]?.change_percent;
  const hasTrendChange = typeof trendChange === "number";
  const trendValueClass = !hasTrendChange
    ? styles.trendValue
    : trendChange > 0
      ? `${styles.trendValue} ${styles.trendUp}`
      : trendChange < 0
        ? `${styles.trendValue} ${styles.trendDown}`
        : styles.trendValue;
  const trendDescription = !hasTrendChange
    ? "Not enough data to calculate trends yet."
    : trendChange > 0
      ? `Spending increased by ${trendChange.toFixed(1)}% since last month.`
      : trendChange < 0
        ? `Spending decreased by ${Math.abs(trendChange).toFixed(1)}% since last month.`
        : "Spending is unchanged from last month.";

  if (loading)
    return (
      <Layout>
        <div className={styles.loading}>Loading...</div>
      </Layout>
    );

  return (
    <Layout
      title={`${greeting()}, ${capitalizeFirst(user?.name)}`}
      subtitle={currentDate()}
    >
      <div className={styles.dashboardGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.hero}>
            <div className={styles.heroLeft}>
              <span className={styles.heroLabel}>TOTAL BALANCE</span>
              <p className={styles.heroAmount}>
                $
                {totalBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
              {typeof currentMonthNet === "number" && (
                <p
                  className={`${styles.heroMonthChange} ${currentMonthNet < 0 ? styles.heroMonthNegative : ""}`}
                >
                  {currentMonthNet < 0 ? "↘ −" : "↗ "}$
                  {Math.abs(currentMonthNet).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  this month
                </p>
              )}
            </div>
            <div className={styles.heroPace}>
              <span className={styles.heroLabel}>GOAL PACE</span>
              <div
                className={styles.paceOptions}
                role="img"
                aria-label={
                  goalPace ? `Goal pace: ${goalPace}` : "No goal pace available"
                }
              >
                {["slow", "moderate", "fast"].map((pace) => (
                  <span
                    key={pace}
                    className={`${styles.paceOption} ${goalPace === pace ? styles.paceOptionActive : ""}`}
                  >
                    {pace[0].toUpperCase() + pace.slice(1)}
                  </span>
                ))}
              </div>
              <p className={styles.paceNote}>
                {goalError
                  ? "Goal pace unavailable."
                  : goals === null
                    ? "Loading goals..."
                    : !goalPace
                      ? "Set a goal to track progress."
                      : goalPace === "slow"
                        ? "Goals are behind their target-date pace."
                        : goalPace === "fast"
                          ? "Goals are ahead of their target-date pace."
                          : "Goals are on pace for their target dates."}
              </p>
            </div>
          </section>

          <div className={styles.overviewTopGrid}>
            <Card title="Accounts">
              <ul className={styles.accountList}>
                {accounts.map((acc) => {
                  const balance = parseFloat(acc.balance || 0);
                  return (
                    <li key={acc.id} className={styles.accountRow}>
                      <div className={styles.accountIcon}>▤</div>
                      <div className={styles.accountInfo}>
                        <span className={styles.accountName}>{acc.name}</span>
                        <div className={styles.accountBarWrapper}>
                          <ProgressBar
                            value={Math.abs(balance)}
                            max={5000}
                            tone={balance < 0 ? "red" : "green"}
                          />
                        </div>
                        <span className={styles.accountMeta}>
                          {acc.type || "Checking"}
                        </span>
                      </div>
                      <span className={styles.accountBalance}>
                        {balance < 0
                          ? `-$${Math.abs(balance).toFixed(2)}`
                          : `$${balance.toFixed(2)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Trends" action="6 MONTHS" className={styles.trendCard}>
              {trendError ? (
                <p className={styles.trendDescription} role="alert">
                  {trendError}
                </p>
              ) : !trendData ? (
                <p className={styles.trendDescription}>Loading trends...</p>
              ) : (
                <>
                  <div className={styles.trendSummary}>
                    <strong className={trendValueClass}>
                      {hasTrendChange
                        ? `${trendChange > 0 ? "+" : ""}${trendChange.toFixed(1)}%`
                        : "0.0%"}
                    </strong>
                    <p className={styles.trendDescription}>
                      {trendDescription}
                    </p>
                  </div>
                  <div className={styles.trendChartWrapper}>
                    <canvas
                      ref={trendCanvasRef}
                      aria-label="Monthly expenses over the last six months"
                      role="img"
                    />
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card title="Budgets & goals" action="Monthly">
            {budgets.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="No budgets set"
                description="Set a monthly limit for your categories to track spending."
              />
            ) : (
              <ul className={styles.budgetList}>
                {budgets.slice(0, 3).map((bg) => {
                  const limit = parseFloat(bg.monthly_limit || 0);
                  const spent = parseFloat(bg.spent || 0);
                  const pct = limit ? (spent / limit) * 100 : 0;
                  const status =
                    pct > 100
                      ? "Over budget"
                      : pct > 85
                        ? "Close"
                        : "On target";
                  const tone = pct > 100 ? "red" : pct > 85 ? "amber" : "green";
                  return (
                    <li key={bg.id} className={styles.budgetRow}>
                      <span className={styles.budgetName}>
                        {bg.category_name}
                      </span>
                      <div className={styles.budgetBarWrapper}>
                        <ProgressBar value={spent} max={limit} tone={tone} />
                      </div>
                      <span className={styles.budgetMeta}>
                        ${spent} / ${limit}
                      </span>
                      <span
                        className={`${styles.budgetStatus} ${styles[tone]}`}
                      >
                        {status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Recent transactions" action="View all">
            {transactions.length === 0 ? (
              <EmptyState
                icon="💸"
                title="No recent transactions"
                description="Your latest transactions will appear here."
              />
            ) : (
              <ul className={styles.txList}>
                {transactions.map((tx) => {
                  const isExpense = tx.type === "expense";
                  const catColor = getCategoryColor(
                    tx.category_name || "Uncategorized",
                  );
                  return (
                    <li key={tx.id} className={styles.txRow}>
                      <div
                        className={styles.txAvatar}
                        style={{ backgroundColor: catColor }}
                      />
                      <div className={styles.txInfo}>
                        <span className={styles.txNote}>
                          {tx.note || "No note"}
                        </span>
                        <span className={styles.txCategory}>
                          {tx.category_name || "Uncategorized"}
                        </span>
                      </div>
                      <span
                        className={
                          isExpense ? styles.txExpense : styles.txIncome
                        }
                      >
                        {isExpense ? "−" : "+"}$
                        {parseFloat(tx.amount).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className={styles.rightRail}>
          <Card
            title="Plan health"
            action={goals && !goalError ? `${goalHealth}%` : undefined}
          >
            {goalError ? (
              <p className={styles.healthMessage} role="alert">
                {goalError}
              </p>
            ) : goals === null ? (
              <p className={styles.healthMessage}>Loading goal health...</p>
            ) : (
              <div className={styles.healthContent}>
                <div
                  className={styles.healthGauge}
                  style={{
                    background: `conic-gradient(var(--color-green) ${goalHealth}%, var(--color-surface-muted) 0)`,
                  }}
                  role="img"
                  aria-label={`Overall goal completion: ${goalHealth}%`}
                >
                  <div className={styles.healthGaugeInner}>{goalHealth}%</div>
                </div>
                <p className={styles.healthMessage}>
                  {goals.length === 0
                    ? "Add savings goals to start tracking your plan health."
                    : `Overall progress across ${goals.length} ${goals.length === 1 ? "goal" : "goals"}.`}
                </p>
              </div>
            )}
          </Card>
          <AiTips tipClassName={`${styles.tipCard} ${styles.tipGreen}`} />

          <ChatPanel />
        </div>
      </div>
    </Layout>
  );
}

export default Overview;
