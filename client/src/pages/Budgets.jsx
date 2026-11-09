import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";

const CATEGORY_ICONS = {
  "Groceries": "🛒",
  "Dining Out": "🍽️",
  "Rent": "🏠",
  "Utilities": "💡",
  "Salary": "💰",
  "Entertainment": "🎬",
  "Luxury": "💎",
  "Health & Medical": "🏥",
  "Subscriptions": "📱",
  "Education": "🎓",
  "Transportation": "🚗",
  "Insurance": "🛡️",
  "Travel": "✈️",
  "Personal Care": "💆",
  "Gifts & Donations": "🎁",
  "Home Maintenance": "🔨",
  "Taxes": "🏛️",
  "Fees & Charges": "⚠️",
  "Pet Care": "🐾",
  "Miscellaneous": "📦",
  "Transfer": "🔄",
  "Default": "💳"
};

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [budgetData, goalData] = await Promise.all([
          api.fetchBudgets(),
          api.fetchSavingsGoals ? api.fetchSavingsGoals() : Promise.resolve([])
        ]);
        
        setBudgets(budgetData);
        setGoals(goalData);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalBudgeted = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_limit || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + parseFloat(b.spent || 0), 0);
  const totalPercent = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).slice(0, 10).split("-");
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  if (loading) return <Layout><div className={styles.loading}>Loading...</div></Layout>;

  return (
    <Layout title="Budgets & Goals" subtitle="Tuesday, September 15 · Your plan is 82% on track">
      <div className={styles.pageWrapper}>
        
        {/* ===== TOP SECTION: BUDGETS ===== */}
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Monthly Budgets</h2>
            <p className={styles.sectionSubtitle}>Track your monthly limits and active limits</p>
          </div>
          <button className={styles.addBtn}>+ Add Budget</button>
        </div>

        <div className={styles.budgetGrid}>
          {/* Donut Chart */}
          <div className={styles.donutCard}>
            <div className={styles.donutChart} style={{ background: `conic-gradient(#4a7fc4 ${totalPercent}%, #f0f0eb 0)` }}>
              <div className={styles.donutInner}>
                <span className={styles.donutPercent}>{totalPercent}%</span>
                <span className={styles.donutLabel}>spent</span>
              </div>
            </div>
            <div className={styles.donutStats}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Spent</span>
                <span className={styles.statValue}>${totalSpent.toLocaleString()}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Limit</span>
                <span className={styles.statValue}>${totalBudgeted.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Individual Budgets */}
          {budgets.map((bg) => {
            const limit = parseFloat(bg.monthly_limit || 0);
            const spent = parseFloat(bg.spent || 0);
            const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            const isOver = pct > 100;
            const icon = CATEGORY_ICONS[bg.category_name] || CATEGORY_ICONS.Default;

            return (
              <div key={bg.id} className={styles.budgetCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <span className={styles.icon}>{icon}</span>
                    <span className={styles.cardTitle}>{bg.category_name}</span>
                  </div>
                  <span className={`${styles.badge} ${isOver ? styles.badgeRed : styles.badgeGrey}`}>
                    {pct}%
                  </span>
                </div>
                <div className={styles.cardAmounts}>
                  <span className={styles.spentAmount}>${spent}</span>
                  <span className={styles.limitAmount}>of ${limit}</span>
                </div>
                <ProgressBar value={spent} max={limit} tone={isOver ? "red" : "blue"} />
              </div>
            );
          })}
        </div>

        {/* ===== BOTTOM SECTION: GOALS ===== */}
        <div className={styles.sectionHeader} style={{ marginTop: "32px" }}>
          <div>
            <h2 className={styles.sectionTitle}>Active Savings Goals</h2>
            <p className={styles.sectionSubtitle}>Monitor your progress toward major financial milestones</p>
          </div>
          <button className={styles.addBtn}>+ Add Goal</button>
        </div>

        <div className={styles.goalGrid}>
          {goals.map((goal) => {
            const saved = parseFloat(goal.current_amount || 0);
            const target = parseFloat(goal.target_amount || 0);
            const pct = target > 0 ? Math.round((saved / target) * 100) : 0;
            
            return (
              <div key={goal.id} className={styles.goalCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{goal.name}</span>
                  <span className={styles.badgeGreen}>{pct}%</span>
                </div>
                <p className={styles.goalDate}>Target completion: {formatDate(goal.target_date)}</p>
                <div className={styles.goalProgress}>
                  <ProgressBar value={saved} max={target} tone="green" />
                </div>
                <div className={styles.goalAmounts}>
                  <span className={styles.goalSaved}>${saved.toLocaleString()}</span>
                  <span className={styles.goalTarget}>${target.toLocaleString()} goal</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </Layout>
  );
}

export default Budgets;
