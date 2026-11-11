import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";
import { PencilIcon } from "../components/Icons/Icons";

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

  // Set when editing an existing item; null means "create new"
  const [editingBudget, setEditingBudget] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);

  // Delete confirmation. step "confirm" first; step "choose" only if a goal has contributions
  const [confirm, setConfirm] = useState(null); // { kind, item, step, contributions, total }

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
  const availableCategories = editingBudget
    ? categories.filter((cat) => cat.id === editingBudget.category_id)
    : categories.filter((cat) => !budgets.some((b) => b.category_id === cat.id));

  const closeBudgetModal = () => {
    setShowBudgetModal(false);
    setEditingBudget(null);
    setBudgetForm({ category_id: "", monthly_limit: "" });
  };

  const closeGoalModal = () => {
    setShowGoalModal(false);
    setEditingGoal(null);
    setGoalForm({ name: "", target_amount: "", target_date: "" });
  };

  const openNewBudget = () => {
    setErrorMsg("");
    setEditingBudget(null);
    setBudgetForm({ category_id: "", monthly_limit: "" });
    setShowBudgetModal(true);
  };

  const openEditBudget = (bg) => {
    setErrorMsg("");
    setEditingBudget(bg);
    setBudgetForm({ category_id: String(bg.category_id), monthly_limit: String(bg.monthly_limit) });
    setShowBudgetModal(true);
  };

  const openNewGoal = () => {
    setErrorMsg("");
    setEditingGoal(null);
    setGoalForm({ name: "", target_amount: "", target_date: "" });
    setShowGoalModal(true);
  };

  const openEditGoal = (goal) => {
    setErrorMsg("");
    setEditingGoal(goal);
    setGoalForm({
      name: goal.name,
      target_amount: String(goal.target_amount),
      target_date: String(goal.target_date).slice(0, 10),
    });
    setShowGoalModal(true);
  };

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      if (editingBudget) {
        await api.updateBudget(editingBudget.id, parseFloat(budgetForm.monthly_limit));
      } else {
        await api.createBudget({
          category_id: Number(budgetForm.category_id),
          monthly_limit: parseFloat(budgetForm.monthly_limit)
        });
      }
      closeBudgetModal();
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
      (g) =>
        g.id !== editingGoal?.id &&
        g.name.toLowerCase() === goalForm.name.trim().toLowerCase()
    );
    if (isDuplicate) {
      setErrorMsg("You already have a goal with this name.");
      setSaving(false);
      return;
    }

    const payload = {
      name: goalForm.name.trim(),
      target_amount: parseFloat(goalForm.target_amount),
      target_date: goalForm.target_date
    };
    try {
      if (editingGoal) {
        await api.updateSavingsGoal(editingGoal.id, payload);
      } else {
        await api.createSavingsGoal(payload);
      }
      closeGoalModal();
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (kind, item) => {
    setErrorMsg("");
    setConfirm({ kind, item, step: "confirm" });
  };

  const runDelete = async (money) => {
    setSaving(true);
    setErrorMsg("");
    try {
      if (confirm.kind === "budget") {
        await api.deleteBudget(confirm.item.id);
      } else {
        await api.deleteSavingsGoal(confirm.item.id, money);
      }
      setConfirm(null);
      await loadData();
    } catch (err) {
      // Goal has contributions: ask the user what happens to the money
      if (confirm.kind === "goal" && err.status === 409) {
        setConfirm({
          ...confirm,
          step: "choose",
          contributions: err.data.contributions,
          total: err.data.total
        });
      } else {
        setErrorMsg(err.message || "Failed to delete.");
      }
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
          <button className={styles.addBtn} onClick={openNewBudget}>+ Add Budget</button>
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
                <div className={styles.cardActions}>
                  <button className={styles.iconBtn} onClick={() => openEditBudget(bg)} aria-label="Edit budget" title="Edit"><PencilIcon /></button>

                </div>
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
          <button className={styles.addBtn} onClick={openNewGoal}>+ Add Goal</button>
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
                <div className={styles.cardActions}>
                  <button className={styles.iconBtn} onClick={() => openEditGoal(goal)} aria-label="Edit goal" title="Edit"><PencilIcon /></button>

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
              <h2>{editingBudget ? "Edit Budget" : "Add Budget"}</h2>
              <button className={styles.closeBtn} onClick={closeBudgetModal}>✕</button>
            </div>
            <p className={styles.modalSubtitle}>Set a monthly limit for a category.</p>
            
            <form onSubmit={handleCreateBudget}>
              <div className={styles.formGroup}>
                <label>Category</label>
                <select 
                  value={budgetForm.category_id} 
                  onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })}
                  disabled={!!editingBudget}
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
                {editingBudget && (
                  <button
                    type="button"
                    className={`${styles.dangerBtn} ${styles.deleteInModal}`}
                    onClick={() => {
                      const item = editingBudget;
                      closeBudgetModal();
                      askDelete("budget", item);
                    }}
                    disabled={saving}
                  >
                    Delete
                  </button>
                )}
                <button type="button" className={styles.outlineBtn} onClick={closeBudgetModal} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : editingBudget ? "Save Changes" : "Save Budget"}</button>
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
              <h2>{editingGoal ? "Edit Savings Goal" : "Add Savings Goal"}</h2>
              <button className={styles.closeBtn} onClick={closeGoalModal}>✕</button>
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
                {editingGoal && (
                  <button
                    type="button"
                    className={`${styles.dangerBtn} ${styles.deleteInModal}`}
                    onClick={() => {
                      const item = editingGoal;
                      closeGoalModal();
                      askDelete("goal", item);
                    }}
                    disabled={saving}
                  >
                    Delete
                  </button>
                )}
                <button type="button" className={styles.outlineBtn} onClick={closeGoalModal} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : editingGoal ? "Save Changes" : "Create Goal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {confirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Delete {confirm.kind === "budget" ? "budget" : "goal"}?</h2>
              <button className={styles.closeBtn} onClick={() => setConfirm(null)} disabled={saving}>✕</button>
            </div>

            {confirm.step === "confirm" && (
              <>
                <p className={styles.modalSubtitle}>
                  {confirm.kind === "budget"
                    ? `"${confirm.item.category_name}" will stop being tracked. Your transactions are not affected.`
                    : `"${confirm.item.name}" will be removed. Your savings are not moved unless you choose below.`}
                </p>
              </>
            )}

            {confirm.step === "choose" && (
              <>
                <p className={styles.modalSubtitle}>
                  This goal has {confirm.contributions} contribution{confirm.contributions === 1 ? "" : "s"} totaling ${confirm.total.toLocaleString()}. What should happen to that money?
                </p>
                <div className={styles.choiceList}>
                  <button className={styles.choiceBtn} onClick={() => runDelete("return")} disabled={saving}>
                    <strong>Return it to my accounts</strong>
                    <span>Each contribution goes back to the account it came from.</span>
                  </button>
                  <button className={styles.choiceBtn} onClick={() => runDelete("spent")} disabled={saving}>
                    <strong>Keep it as spent</strong>
                    <span>Remove the goal and its contribution history. Account balances stay the same.</span>
                  </button>
                </div>
              </>
            )}

            {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}

            <div className={styles.modalFooter}>
              <button type="button" className={styles.outlineBtn} onClick={() => setConfirm(null)} disabled={saving}>Cancel</button>
              {confirm.step === "confirm" && (
                <button type="button" className={styles.dangerBtn} onClick={() => runDelete(undefined)} disabled={saving}>
                  {saving ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}

export default Budgets;
