import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";

// "2028-12-01" -> "Dec 2028". Parsed as UTC so the day can't shift.
function formatMonthYear(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function AddBudgetModal({ existingCategoryIds, onClose, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchCategories()
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingCats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // A category can only have one budget, so hide the ones that already have one.
  const available = categories.filter(
    (c) => !existingCategoryIds.includes(c.id),
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!categoryId) {
      setError("Choose a category.");
      return;
    }
    const amount = Number(limit);
    if (!limit || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a monthly limit greater than 0.");
      return;
    }

    setBusy(true);
    try {
      await api.createBudget({
        category_id: Number(categoryId),
        monthly_limit: amount,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={() => !busy && onClose()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-budget-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-budget-title" className={styles.modalTitle}>
          Add a budget
        </h3>
        <p className={styles.modalSubtitle}>
          Set a monthly limit for one category.
        </p>

        <form onSubmit={handleSubmit}>
          <label className={styles.fieldLabel} htmlFor="budget-category">
            Category
          </label>
          <select
            id="budget-category"
            className={styles.fieldInput}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={loadingCats || available.length === 0}
          >
            <option value="">
              {loadingCats ? "Loading..." : "Select a category"}
            </option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!loadingCats && available.length === 0 && (
            <p className={styles.modalHint}>
              Every category already has a budget.
            </p>
          )}

          <label className={styles.fieldLabel} htmlFor="budget-limit">
            Monthly limit
          </label>
          <div className={styles.moneyInputWrap}>
            <span className={styles.moneyPrefix}>$</span>
            <input
              id="budget-limit"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className={`${styles.fieldInput} ${styles.moneyInput}`}
            />
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.addBtn}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={busy || available.length === 0}
            >
              {busy ? "Saving..." : "Add budget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddGoalModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = name.trim();
    const amount = Number(targetAmount);
    if (!trimmed) {
      setError("Enter a goal name.");
      return;
    }
    if (!targetAmount || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a target amount greater than 0.");
      return;
    }
    if (!targetDate) {
      setError("Pick a target date.");
      return;
    }

    setBusy(true);
    try {
      await api.createGoal({
        name: trimmed,
        target_amount: amount,
        target_date: targetDate,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={() => !busy && onClose()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-goal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-goal-title" className={styles.modalTitle}>
          Add a savings goal
        </h3>
        <p className={styles.modalSubtitle}>
          Name the goal, set the amount, and pick a date to reach it.
        </p>

        <form onSubmit={handleSubmit}>
          <label className={styles.fieldLabel} htmlFor="goal-name">
            Goal name
          </label>
          <input
            id="goal-name"
            type="text"
            maxLength={100}
            placeholder="e.g. Emergency Fund"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.fieldInput}
          />

          <label className={styles.fieldLabel} htmlFor="goal-amount">
            Target amount
          </label>
          <div className={styles.moneyInputWrap}>
            <span className={styles.moneyPrefix}>$</span>
            <input
              id="goal-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className={`${styles.fieldInput} ${styles.moneyInput}`}
            />
          </div>

          <label className={styles.fieldLabel} htmlFor="goal-date">
            Target date
          </label>
          <input
            id="goal-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={styles.fieldInput}
          />

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.addBtn}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={busy}>
              {busy ? "Saving..." : "Add goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [budgetError, setBudgetError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [notice, setNotice] = useState("");

  const loadBudgets = useCallback(async () => {
    try {
      setBudgets(await api.fetchBudgets());
      setBudgetError("");
    } catch (err) {
      setBudgetError(err.message);
    }
  }, []);

  const loadGoals = useCallback(async () => {
    try {
      setGoals(await api.fetchGoals());
      setGoalError("");
    } catch (err) {
      setGoalError(err.message);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadBudgets(), loadGoals()]).finally(() => setLoading(false));
  }, [loadBudgets, loadGoals]);

  async function handleBudgetCreated() {
    setShowAddBudget(false);
    setNotice("Budget added.");
    await loadBudgets();
  }

  async function handleGoalCreated() {
    setShowAddGoal(false);
    setNotice("Goal added.");
    await loadGoals();
  }

  // Totals come only from real data.
  const totalBudgeted = budgets.reduce(
    (sum, b) => sum + parseFloat(b.monthly_limit || 0),
    0,
  );
  const totalSpent = budgets.reduce(
    (sum, b) => sum + parseFloat(b.spent || 0),
    0,
  );
  const totalPercent = totalBudgeted
    ? Math.round((totalSpent / totalBudgeted) * 100)
    : 0;

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <Layout title="Budgets & Goals">
        <div className={styles.loading}>Loading budgets...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Budgets & Goals" subtitle={todayLabel}>
      <div className={styles.pageWrapper}>
        {/* ===== BUDGETS ===== */}
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Monthly Budgets</h2>
            <p className={styles.sectionSubtitle}>
              Track your monthly limits and active limits
            </p>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => {
              setNotice("");
              setShowAddBudget(true);
            }}
          >
            + Add Budget
          </button>
        </div>

        {budgetError && <p className={styles.errorText}>{budgetError}</p>}
        {notice && <p className={styles.successText}>{notice}</p>}

        <div className={styles.budgetGrid}>
          {/* 1. Hero Donut Chart */}
          <div className={styles.donutCard}>
            <div
              className={styles.donutChart}
              style={{
                background: `conic-gradient(#4a7fc4 ${totalPercent}%, #f0f0eb 0)`,
              }}
            >
              <div className={styles.donutInner}>
                <span className={styles.donutPercent}>{totalPercent}%</span>
                <span className={styles.donutLabel}>Spent</span>
              </div>
            </div>
            <div className={styles.donutStats}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Spent</span>
                <span className={styles.statValue}>
                  ${totalSpent.toLocaleString()}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Limit</span>
                <span className={styles.statValue}>
                  ${totalBudgeted.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Individual Budget Cards */}
          {budgets.map((bg) => {
            const limit = parseFloat(bg.monthly_limit || 0);
            const spent = parseFloat(bg.spent || 0);
            const pct = limit ? Math.round((spent / limit) * 100) : 0;
            const isOver = pct > 100;

            return (
              <div key={bg.id} className={styles.budgetCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <span className={styles.cardTitle}>{bg.category_name}</span>
                  </div>
                  <span
                    className={`${styles.badge} ${isOver ? styles.badgeRed : styles.badgeGrey}`}
                  >
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

        {/* ===== SAVINGS GOALS ===== */}
        <div className={styles.sectionHeader} style={{ marginTop: "32px" }}>
          <div>
            <h2 className={styles.sectionTitle}>Active Savings Goals</h2>
            <p className={styles.sectionSubtitle}>
              Monitor your progress toward major financial milestones
            </p>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => {
              setNotice("");
              setShowAddGoal(true);
            }}
          >
            + Add Goal
          </button>
        </div>

        {goalError && <p className={styles.errorText}>{goalError}</p>}

        {goals.length === 0 && !goalError && (
          <p className={styles.sectionSubtitle}>No savings goals yet.</p>
        )}

        <div className={styles.goalGrid}>
          {goals.map((goal) => {
            const target = parseFloat(goal.target_amount || 0);
            const saved = parseFloat(goal.current_amount || 0);
            const pct = target ? Math.round((saved / target) * 100) : 0;

            return (
              <div key={goal.id} className={styles.goalCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{goal.name}</span>
                  <span className={styles.badgeGreen}>{pct}%</span>
                </div>
                <p className={styles.goalDate}>
                  Target completion: {formatMonthYear(goal.target_date)}
                </p>

                <div className={styles.goalProgress}>
                  <ProgressBar value={saved} max={target} tone="green" />
                </div>

                <div className={styles.goalAmounts}>
                  <span className={styles.goalSaved}>
                    ${saved.toLocaleString()}
                  </span>
                  <span className={styles.goalTarget}>
                    ${target.toLocaleString()} goal
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAddBudget && (
        <AddBudgetModal
          existingCategoryIds={budgets.map((b) => b.category_id)}
          onClose={() => setShowAddBudget(false)}
          onCreated={handleBudgetCreated}
        />
      )}

      {showAddGoal && (
        <AddGoalModal
          onClose={() => setShowAddGoal(false)}
          onCreated={handleGoalCreated}
        />
      )}
    </Layout>
  );
}

export default Budgets;
