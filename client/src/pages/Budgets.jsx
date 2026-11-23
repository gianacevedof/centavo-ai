import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import EmptyState from "../components/EmptyState/EmptyState";
import Card from "../components/Card/Card";
import ChatPanel from "../components/ChatPanel/ChatPanel";
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
  const [overview, setOverview] = useState(null);
  const [goals, setGoals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [editingBudget, setEditingBudget] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
  const [confirm, setConfirm] = useState(null);

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
      api.fetchBudgetOverview().then(setOverview).catch(() => setOverview(null));
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

  const availableCategories = editingBudget
    ? categories.filter((cat) => Number(cat.id) === Number(editingBudget.category_id))
    : categories.filter((cat) => !budgets.some((b) => Number(b.category_id) === Number(cat.id)));
  const overviewTips = overview?.tips?.tips ?? [];

  const closeBudgetModal = () => { setShowBudgetModal(false); setEditingBudget(null); setBudgetForm({ category_id: "", monthly_limit: "" }); };
  const closeGoalModal = () => { setShowGoalModal(false); setEditingGoal(null); setGoalForm({ name: "", target_amount: "", target_date: "" }); };
  const openNewBudget = () => { setErrorMsg(""); setEditingBudget(null); setBudgetForm({ category_id: "", monthly_limit: "" }); setShowBudgetModal(true); };
  const openEditBudget = (budget) => { setErrorMsg(""); setEditingBudget(budget); setBudgetForm({ category_id: String(budget.category_id), monthly_limit: String(budget.monthly_limit) }); setShowBudgetModal(true); };
  const openNewGoal = () => { setErrorMsg(""); setEditingGoal(null); setGoalForm({ name: "", target_amount: "", target_date: "" }); setShowGoalModal(true); };
  const openEditGoal = (goal) => { setErrorMsg(""); setEditingGoal(goal); setGoalForm({ name: goal.name, target_amount: String(goal.target_amount), target_date: String(goal.target_date).slice(0, 10) }); setShowGoalModal(true); };

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    setSaving(true); setErrorMsg("");
    try {
      if (editingBudget) { await api.updateBudget(editingBudget.id, parseFloat(budgetForm.monthly_limit)); toast.success("Budget updated successfully!"); }
      else { await api.createBudget({ category_id: Number(budgetForm.category_id), monthly_limit: parseFloat(budgetForm.monthly_limit) }); toast.success("Budget created successfully!"); }
      closeBudgetModal(); await loadData();
    } catch (err) { toast.error(err.message || "Failed to create budget."); } finally { setSaving(false); }
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault(); setSaving(true); setErrorMsg("");
    const isDuplicate = goals.some((g) => g.id !== editingGoal?.id && g.name.toLowerCase() === goalForm.name.trim().toLowerCase());
    if (isDuplicate) { setErrorMsg("You already have a goal with this name."); setSaving(false); return; }
    try {
      const payload = { name: goalForm.name.trim(), target_amount: parseFloat(goalForm.target_amount), target_date: goalForm.target_date };
      if (editingGoal) { await api.updateSavingsGoal(editingGoal.id, payload); toast.success("Savings goal updated!"); }
      else { await api.createSavingsGoal(payload); toast.success("Savings goal created!"); }
      closeGoalModal(); await loadData();
    } catch (err) { toast.error(err.message || "Failed to create goal."); } finally { setSaving(false); }
  };

  const askDelete = (kind, item) => { setErrorMsg(""); setConfirm({ kind, item, step: "confirm" }); };

  const runDelete = async (money) => {
    if (!confirm) return;
    setSaving(true); setErrorMsg("");
    try {
      if (confirm.kind === "budget") { await api.deleteBudget(confirm.item.id); toast.success("Budget deleted."); }
      else { await api.deleteSavingsGoal(confirm.item.id, money); toast.success("Savings goal deleted."); }
      setConfirm(null); await loadData();
    } catch (err) {
      if (confirm.kind === "goal" && err.status === 409) { setConfirm({ ...confirm, step: "choose", contributions: err.data.contributions, total: err.data.total }); }
      else { setErrorMsg(err.message || "Failed to delete."); }
    } finally { setSaving(false); }
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
    <Layout title="Budgets & Goals" subtitle="Manage your monthly budgets and savings goals.">
      <div className={styles.pageWrapper}>
        
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Monthly Budgets</h2>
            <p className={styles.sectionSubtitle}>Track your monthly limits and active limits</p>
          </div>
          <button className={styles.addBtn} onClick={openNewBudget}>+ Add Budget</button>
        </div>

        <div className={styles.budgetGrid}>
          {budgets.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <EmptyState icon="🎯" title="No budgets set" description="Create a monthly limit for a category to start tracking your spending." actionLabel="+ Add Budget" onAction={() => setShowBudgetModal(true)} />
            </div>
          ) : (
            <>
              <div className={styles.donutCard}>
                <div className={styles.donutChart} style={{ background: `conic-gradient(#4a7fc4 ${totalPercent}%, #f0f0eb 0)` }}>
                  <div className={styles.donutInner}>
                    <span className={styles.donutPercent}>{totalPercent}%</span>
                    <span className={styles.donutLabel}>spent</span>
                  </div>
                </div>
                <div className={styles.donutStats}>
                  <div className={styles.statRow}><span className={styles.statLabel}>Total Spent</span><span className={styles.statValue}>${totalSpent.toLocaleString()}</span></div>
                  <div className={styles.statRow}><span className={styles.statLabel}>Total Limit</span><span className={styles.statValue}>${totalBudgeted.toLocaleString()}</span></div>
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
                      <div className={styles.cardTitleGroup}><span className={styles.icon}>{icon}</span><span className={styles.cardTitle}>{bg.category_name}</span></div>
                      <span className={`${styles.badge} ${isOver ? styles.badgeRed : styles.badgeGrey}`}>{pct}%</span>
                    </div>
                    <div className={styles.cardAmounts}><span className={styles.spentAmount}>${spent}</span><span className={styles.limitAmount}>of ${limit}</span></div>
                    <div><ProgressBar value={spent} max={limit} tone={isOver ? "red" : "blue"} /></div>
                    <div className={styles.cardActions}><button className={styles.iconBtn} onClick={() => openEditBudget(bg)} aria-label="Edit budget" title="Edit"><PencilIcon /></button></div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {overviewTips.length > 0 && (
          <Card title="Tips">
            {overviewTips.map((tip, index) => (
              <article key={`${tip.category ?? "general"}-${tip.title}-${index}`}>
                <p><strong>{tip.category ? `${tip.category}: ` : ""}{tip.title}</strong></p>
                <p>{tip.body}</p>
              </article>
            ))}
          </Card>
        )}

        <div className={styles.sectionHeader} style={{ marginTop: "32px" }}>
          <div>
            <h2 className={styles.sectionTitle}>Active Savings Goals</h2>
            <p className={styles.sectionSubtitle}>Monitor your progress toward major financial milestones</p>
          </div>
          <button className={styles.addBtn} onClick={openNewGoal}>+ Add Goal</button>
        </div>

        {goals.length === 0 ? (
          <EmptyState icon="🏆" title="No savings goals yet" description="Create a goal to start saving towards your next big milestone." actionLabel="+ Add Goal" onAction={() => setShowGoalModal(true)} />
        ) : (
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
                  <div className={styles.goalProgress}><ProgressBar value={saved} max={target} tone="green" /></div>
                  <div className={styles.goalAmounts}><span className={styles.goalSaved}>${saved.toLocaleString()}</span><span className={styles.goalTarget}>${target.toLocaleString()} goal</span></div>
                  <div className={styles.cardActions}><button className={styles.iconBtn} onClick={() => openEditGoal(goal)} aria-label="Edit goal" title="Edit"><PencilIcon /></button></div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "var(--space-xl)" }}>
          <ChatPanel />
        </div>
      </div>

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
                <select value={budgetForm.category_id} onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })} disabled={!!editingBudget} required>
                  <option value="">Select a category</option>
                  {availableCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Monthly Limit ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={budgetForm.monthly_limit} onChange={(e) => setBudgetForm({ ...budgetForm, monthly_limit: e.target.value })} required />
              </div>
              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
              <div className={styles.modalFooter}>
                {editingBudget && (<button type="button" className={`${styles.dangerBtn} ${styles.deleteInModal}`} onClick={() => { const budget = editingBudget; closeBudgetModal(); askDelete("budget", budget); }} disabled={saving}>Delete</button>)}
                <button type="button" className={styles.outlineBtn} onClick={closeBudgetModal} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : editingBudget ? "Save Changes" : "Save Budget"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGoalModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>{editingGoal ? "Edit Savings Goal" : "Add Savings Goal"}</h2>
              <button className={styles.closeBtn} onClick={closeGoalModal}>✕</button>
            </div>
            <p className={styles.modalSubtitle}>Create a new milestone to save towards.</p>
            <form onSubmit={handleCreateGoal}>
              <div className={styles.formGroup}><label>Goal Name</label><input type="text" placeholder="e.g. New Car, Vacation" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} required /></div>
              <div className={styles.formGroup}><label>Target Amount ($)</label><input type="number" step="0.01" min="0" placeholder="0.00" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} required /></div>
              <div className={styles.formGroup}><label>Target Date</label><input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} required /></div>
              {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
              <div className={styles.modalFooter}>
                {editingGoal && (<button type="button" className={`${styles.dangerBtn} ${styles.deleteInModal}`} onClick={() => { const goal = editingGoal; closeGoalModal(); askDelete("goal", goal); }} disabled={saving}>Delete</button>)}
                <button type="button" className={styles.outlineBtn} onClick={closeGoalModal} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? "Saving..." : editingGoal ? "Save Changes" : "Create Goal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Delete {confirm.kind === "budget" ? "budget" : "goal"}?</h2>
              <button className={styles.closeBtn} onClick={() => setConfirm(null)} disabled={saving}>✕</button>
            </div>
            {confirm.step === "confirm" && (<p className={styles.modalSubtitle}>{confirm.kind === "budget" ? `"${confirm.item.category_name}" will stop being tracked. Your transactions are not affected.` : `"${confirm.item.name}" will be removed. Your savings are not moved unless you choose below.`}</p>)}
            {confirm.step === "choose" && (
              <>
                <p className={styles.modalSubtitle}>This goal has {confirm.contributions} contribution{confirm.contributions === 1 ? "" : "s"} totaling ${confirm.total.toLocaleString()}. What should happen to that money?</p>
                <div className={styles.choiceList}>
                  <button className={styles.choiceBtn} onClick={() => runDelete("return")} disabled={saving}><strong>Return it to my accounts</strong><span>Each contribution goes back to the account it came from.</span></button>
                  <button className={styles.choiceBtn} onClick={() => runDelete("spent")} disabled={saving}><strong>Keep it as spent</strong><span>Remove the goal and its contribution history. Account balances stay the same.</span></button>
                </div>
              </>
            )}
            {errorMsg && <p className={styles.errorText}>{errorMsg}</p>}
            <div className={styles.modalFooter}>
              <button type="button" className={styles.outlineBtn} onClick={() => setConfirm(null)} disabled={saving}>Cancel</button>
              {confirm.step === "confirm" && (<button type="button" className={styles.dangerBtn} onClick={() => runDelete(undefined)} disabled={saving}>{saving ? "Deleting..." : "Delete"}</button>)}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Budgets;
