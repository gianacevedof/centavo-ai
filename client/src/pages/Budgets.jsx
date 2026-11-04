import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import styles from "./Budgets.module.css";

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

  // Close on Escape, unless a save is in progress.
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

function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");

  const loadBudgets = useCallback(async () => {
    try {
      setBudgets(await api.fetchBudgets());
      setLoadError("");
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    loadBudgets().finally(() => setLoading(false));
  }, [loadBudgets]);

  async function handleCreated() {
    setShowAdd(false);
    setNotice("Budget added.");
    await loadBudgets();
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
              setShowAdd(true);
            }}
          >
            + Add Budget
          </button>
        </div>

        {loadError && <p className={styles.errorText}>{loadError}</p>}
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
      </div>

      {showAdd && (
        <AddBudgetModal
          existingCategoryIds={budgets.map((b) => b.category_id)}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}
    </Layout>
  );
}

export default Budgets;
