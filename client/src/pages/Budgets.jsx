import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";

// Emojis for categories to match the mockup icons
const CATEGORY_ICONS = {
  Groceries: "🛒",
  "Dining Out": "🍽️",
  Transport: "🚗",
  Utilities: "💡",
  Entertainment: "🎬",
  Shopping: "🛍️",
  Default: "💳"
};

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hardcoded goals for now to match mockup (replace with API later)
  const goals = [
    { id: 1, name: "Emergency Fund", targetDate: "Dec 2028", saved: 15000, target: 20000, tone: "green" },
    { id: 2, name: "Euro Vacation", targetDate: "Jun 2027", saved: 3250, target: 5000, tone: "green" },
    { id: 3, name: "Electric Vehicle", targetDate: "Mar 2028", saved: 12000, target: 35000, tone: "green" },
  ];

  useEffect(() => {
    async function loadBudgets() {
      setLoading(true);
      try {
        const data = await api.fetchBudgets();
        setBudgets(data);
      } catch (err) {
        console.error("Failed to load budgets:", err);
      } finally {
        setLoading(false);
      }
    }
    loadBudgets();
  }, []);

  // Math for the Donut Chart
  const totalBudgeted = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_limit || 0), 0) || 5000;
  const totalSpent = budgets.reduce((sum, b) => sum + parseFloat(b.spent || 0), 0) || 3450;
  const totalPercent = Math.round((totalSpent / totalBudgeted) * 100) || 69;

  if (loading) {
    return (
      <Layout title="Budgets & Goals">
        <div className={styles.loading}>Loading budgets...</div>
      </Layout>
    );
  }

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
          {/* 1. Hero Donut Chart */}
          <div className={styles.donutCard}>
            <div 
              className={styles.donutChart} 
              style={{ background: `conic-gradient(#4a7fc4 ${totalPercent}%, #f0f0eb 0)` }}
            >
              <div className={styles.donutInner}>
                <span className={styles.donutPercent}>{totalPercent}%</span>
                <span className={styles.donutLabel}>Spent</span>
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

          {/* 2. Individual Budget Cards */}
          {budgets.map((bg) => {
            const limit = parseFloat(bg.monthly_limit || 0);
            const spent = parseFloat(bg.spent || 0);
            const pct = limit ? Math.round((spent / limit) * 100) : 0;
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
                
                <ProgressBar 
                  value={spent} 
                  max={limit} 
                  tone={isOver ? "red" : "blue"} 
                />
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
            const pct = Math.round((goal.saved / goal.target) * 100);
            return (
              <div key={goal.id} className={styles.goalCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{goal.name}</span>
                  <span className={styles.badgeGreen}>{pct}%</span>
                </div>
                <p className={styles.goalDate}>Target completion: {goal.targetDate}</p>
                
                <div className={styles.goalProgress}>
                  <ProgressBar value={goal.saved} max={goal.target} tone="green" />
                </div>
                
                <div className={styles.goalAmounts}>
                  <span className={styles.goalSaved}>${goal.saved.toLocaleString()}</span>
                  <span className={styles.goalTarget}>${goal.target.toLocaleString()} goal</span>
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