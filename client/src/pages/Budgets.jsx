import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";

const CATEGORY_ICONS = {
  "Groceries": "🛒", "Dining Out": "🍽️", "Rent": "🏠", "Utilities": "💡",
  "Salary": "💰", "Entertainment": "🎬", "Luxury": "💎", "Health & Medical": "🏥",
  "Subscriptions": "📱", "Education": "🎓", "Transportation": "🚗", "Insurance": "🛡️",
  "Travel": "✈️", "Personal Care": "💆", "Gifts & Donations": "🎁", "Home Maintenance": "🔨",
  "Taxes": "🏛️", "Fees & Charges": "⚠️", "Pet Care": "🐾", "Miscellaneous": "📦",
  "Transfer": "🔄", "Default": "💳"
};

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [budgetForm, setBudgetForm] = useState({ category_id: "", monthly_limit: "" });
  const [goalForm, setGoalForm] = useState({ name: "", target_amount: "", target_date: "" });

  const loadData = async () => {
    setLoading(true);
    try {
      const [budgetData, goalData, catData] = await Promise.all([
        api.fetchBudgets(),
        api.fetchSavingsGoals ? api.fetchSavingsGoals() : Promise.resolve([]),
        api.fetchCategories()
      ]);
      setBudgets(budgetData);
      setGoals(goalData);
      setCategories(catData.filter(c => c.name !== "Transfer"));
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter out categories that already have a budget set
  const availableCategories = categories.filter(
    (cat) => !budgets.some((b) => b.category_id === cat.id)
  );

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      await api.createBudget({
        category_id: Number(budgetForm.category_id),
        monthly_limit: parseFloat(budgetForm.monthly_limit)
      });
      setShowBudgetModal(false);
      setBudgetForm({ category_id: "", monthly_limit: "" });
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to create budget.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    // Frontend check for duplicate goal name (case-insensitive)
    const isDuplicate = goals.some(
      (g) => g.name.toLowerCase() === goalForm.name.trim().toLowerCase()
    );
    if (isDuplicate) {
      setErrorMsg("You already have a goal with this name.");
      setSaving(false);
      return;
    }

    try {
      await api.createSavingsGoal({
        name: goalForm.name.trim(),
        target_amount: parseFloat(goalForm.target_amount),
        target_date: goalForm.target_date
      });
      setShowGoalModal(false);
      setGoalForm({ name: "", target_amount: "", target_date: "" });
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

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
        
        {/* TOP SECTION: BUDGETS */}
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Monthly Budgets</h2>
            <p className={styles.sectionSubtitle}>Track your monthly limits and active limits</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setErrorMsg(""); setShowBudgetModal(true); }}>+ Add Budget</button>
        </div>

        <div className={styles.budgetGrid}>
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
                  <span className={`${styles.badge} ${isOver ? styles.badgeRed : styles.badgeGrey}`}>{pct}%</span>
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

        {/* BOTTOM SECTION: GOALS */}
        <div className={styles.sectionHeader} style={{ marginTop: "32px" }}>
          <div>
            <h2 className={styles.sectionTitle}>Active Savings Goals</h2>
            <p className={styles.sectionSubtitle}>Monitor your progress toward major financial milestones</p>
          </div>
          <button className={styles.addBtn} onClick={() => { setErrorMsg(""); setShowGoalModal(true); }}>+ Add Goal</button>
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

      {/* BUDGET MODAL */}
      {showBudgetModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Add Budget</h2>
              <button className={styles.closeBtn} onClick={() => setShowBudgetModal(false)}>✕</button>
            </div>
            <p className={styles.modalSubtitle}>Set a monthly limit for a category.</p>
            
            <form onSubmit={handleCreateBudget}>
              <div className={styles.formGroup}>
                <label>Category</label>
                <select 
                  value={budgetForm.category_id} 
                  onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })}
                  required
                >
                  <option value="">Select a category</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Monthly Limit ($)</label>
                <input 
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={budgetForm.monthly_limit} 
                  onChange={(e) => setBudgetForm({ ...budgetForm, monthly_limit: e.target.value })}
                  required
                />
              </div>
              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.outlineBtn} onClick={() => setShowBudgetModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : "Save Budget"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GOAL MODAL */}
      {showGoalModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Add Savings Goal</h2>
              <button className={styles.closeBtn} onClick={() => setShowGoalModal(false)}>✕</button>
            </div>
            <p className={styles.modalSubtitle}>Create a new milestone to save towards.</p>
            
            <form onSubmit={handleCreateGoal}>
              <div className={styles.formGroup}>
                <label>Goal Name</label>
                <input 
                  type="text" placeholder="e.g. New Car, Vacation"
                  value={goalForm.name} 
                  onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Target Amount ($)</label>
                <input 
                  type="number" step="0.01" min="0" placeholder="0.00"
                  value={goalForm.target_amount} 
                  onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Target Date</label>
                <input 
                  type="date" 
                  value={goalForm.target_date} 
                  onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                  required
                />
              </div>
              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.outlineBtn} onClick={() => setShowGoalModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : "Create Goal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </Layout>
  );
}

export default Budgets;
