import React, { useState, useEffect, useCallback } from "react";
// Note: Adjusted imports since this file is directly in /pages
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Transactions.module.css";

const TRANSFER = "transfer";

// Keeps the first row for each name (same behavior as before)
function dedupeByName(list) {
  return Array.from(new Map(list.map((item) => [item.name, item])).values());
}

// Today's date in the user's local time, as YYYY-MM-DD
function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm() {
  return {
    type: "expense",
    amount: "",
    account_id: "",
    to_account_id: "",
    category_id: "",
    date: todayLocal(),
    note: "",
  };
}

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", account: "" });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  // Add transaction modal state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load accounts and categories for the dropdowns
  const loadLookupData = useCallback(async () => {
    try {
      const [accs, cats] = await Promise.all([
        api.fetchAccounts(),
        api.fetchCategories(),
      ]);
      setAccounts(dedupeByName(accs));
      setCategories(dedupeByName(cats));
    } catch (err) {
      console.error("Failed to load lookup data:", err);
    }
  }, []);

  useEffect(() => {
    loadLookupData();
  }, [loadLookupData]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchTransactions(filters);
      // Newest added first; id breaks ties for rows added at the same time
      const newestFirst = [...data].sort((a, b) => {
        const diff = new Date(b.created_at) - new Date(a.created_at);
        return diff !== 0 ? diff : b.id - a.id;
      });
      setTransactions(newestFirst);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => setFilters({ category: "", account: "" });

  // Helpers to map IDs to names
  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const getAccountName = (id) => accounts.find((a) => a.id === id)?.name || "Unknown";

  // Helper for category dots
  const getCategoryColor = (name) => {
    const colors = ["#c4453a", "#2d7a5f", "#d99a2b", "#4a7fc4", "#6b7280", "#8b5cf6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // ----- Add transaction form -----

  const isTransfer = form.type === TRANSFER;
  const sourceAccount = accounts.find((a) => String(a.id) === String(form.account_id));
  const amountNum = Number(form.amount);
  const cardSource = isTransfer && sourceAccount?.type === "credit_card";
  const overBalance =
    isTransfer && sourceAccount && amountNum > parseFloat(sourceAccount.balance);

  function openForm() {
    setForm(emptyForm());
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError("");
  }

  function updateForm(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Same rules the server checks, so the user sees problems before submitting
  function checkForm() {
    if (!form.account_id) return "Pick an account.";
    if (!(amountNum > 0)) return "Amount must be greater than 0.";
    if (!form.date) return "Pick a date.";
    if (isTransfer) {
      if (!form.to_account_id) return "Pick a destination account.";
      if (form.to_account_id === form.account_id) return "Pick two different accounts.";
      if (cardSource) return "Transfers can't come from a credit card.";
      if (overBalance) return "That's more than this account has.";
    } else if (!form.category_id) {
      return "Pick a category.";
    }
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = checkForm();
    if (problem) {
      setFormError(problem);
      return;
    }

    const payload = {
      type: form.type,
      account_id: Number(form.account_id),
      amount: amountNum,
      date: form.date,
      note: form.note || null,
      ...(isTransfer
        ? { to_account_id: Number(form.to_account_id) }
        : { category_id: Number(form.category_id) }),
    };

    setSaving(true);
    setFormError("");
    try {
      await api.createTransaction(payload);
      setShowForm(false);
      setNotice(isTransfer ? "Transfer saved." : "Transaction saved.");
      // Refresh balances and the table
      await Promise.all([loadLookupData(), loadTransactions()]);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const net = income - expenses;

  return (
    <Layout
      title="Transactions"
      subtitle="Tuesday, September 15 · Your plan is 82% on track"
    >
      <div className={styles.container}>

        {/* Top Filter Bar */}
        <div className={styles.topBar}>
          <div className={styles.filtersGroup}>
            <select className={styles.filterSelect} name="date">
              <option>Date Range</option>
            </select>
            <select className={styles.filterSelect} name="account" value={filters.account} onChange={handleFilterChange}>
              <option value="">All Accounts</option>
              {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
            <select className={styles.filterSelect} name="category" value={filters.category} onChange={handleFilterChange}>
              <option value="">Categories</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <button className={styles.clearBtn} onClick={clearFilters}>Clear Filters</button>
          <button onClick={openForm}>+ Add transaction</button>
        </div>

        {notice && <p role="status">{notice}</p>}

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Period Income</span>
            <span className={styles.textGreen}>${income.toFixed(2)}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Period Expenses</span>
            <span className={styles.textPrimary}>${expenses.toFixed(2)}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Net Savings</span>
            <span className={styles.textPurple}>
              {net < 0 ? "-" : "+"}${Math.abs(net).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Data Table */}
        <Card className={styles.tableCard}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description / Merchant</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th className={styles.textRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className={styles.emptyState}>Loading transactions...</td></tr>
                ) : transactions.length === 0 ? (
                  <tr><td colSpan="5" className={styles.emptyState}>No transactions found</td></tr>
                ) : (
                  transactions.map((tx) => {
                    const catName = getCategoryName(tx.category_id);
                    return (
                      <tr key={tx.id}>
                        <td className={styles.dateCell}>{tx.date}</td>
                        <td className={styles.descCell}>{tx.note || "No description"}</td>
                        <td>
                          <div className={styles.categoryCell}>
                            <span className={styles.dot} style={{ backgroundColor: getCategoryColor(catName) }} />
                            {catName}
                          </div>
                        </td>
                        <td className={styles.accountCell}>{getAccountName(tx.account_id)}</td>
                        <td className={`${styles.textRight} ${tx.type === "expense" ? styles.textRed : styles.textGreen} ${styles.amountCell}`}>
                          {tx.type === "expense" ? "-" : "+"}${parseFloat(tx.amount).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className={styles.pagination}>
            <span className={styles.pageInfo}>Showing 1-{transactions.length} of {transactions.length} transactions</span>
            <div className={styles.pageButtons}>
              <button className={styles.pageBtn} disabled>Prev</button>
              <button className={`${styles.pageBtn} ${styles.pageBtnActive}`}>1</button>
              <button className={styles.pageBtn}>2</button>
              <button className={styles.pageBtn}>Next</button>
            </div>
          </div>
        </Card>
      </div>

      {/* Add Transaction Modal (design: Manual Add Transaction Modal) */}
      {showForm && (
        <dialog open>
          <h2>Add transaction</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="tx-type">Type</label>
            <select
              id="tx-type"
              value={form.type}
              onChange={(e) => updateForm("type", e.target.value)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>

            <label htmlFor="tx-amount">Amount</label>
            <input
              id="tx-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => updateForm("amount", e.target.value)}
            />

            <label htmlFor="tx-account">{isTransfer ? "From account" : "Account"}</label>
            <select
              id="tx-account"
              value={form.account_id}
              onChange={(e) => updateForm("account_id", e.target.value)}
            >
              <option value="">Select an account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {sourceAccount && (
              <p>Current balance: ${parseFloat(sourceAccount.balance).toFixed(2)}</p>
            )}

            {isTransfer && (
              <>
                <label htmlFor="tx-to">To account</label>
                <select
                  id="tx-to"
                  value={form.to_account_id}
                  onChange={(e) => updateForm("to_account_id", e.target.value)}
                >
                  <option value="">Select an account</option>
                  {accounts
                    .filter((a) => String(a.id) !== String(form.account_id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
              </>
            )}

            {!isTransfer && (
              <>
                <label htmlFor="tx-category">Category</label>
                <select
                  id="tx-category"
                  value={form.category_id}
                  onChange={(e) => updateForm("category_id", e.target.value)}
                >
                  <option value="">Select a category</option>
                  {categories
                    .filter((c) => c.name !== "Transfer")
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </>
            )}

            <label htmlFor="tx-date">Date</label>
            <input
              id="tx-date"
              type="date"
              value={form.date}
              onChange={(e) => updateForm("date", e.target.value)}
            />

            <label htmlFor="tx-note">Note (optional)</label>
            <input
              id="tx-note"
              type="text"
              maxLength={255}
              value={form.note}
              onChange={(e) => updateForm("note", e.target.value)}
            />

            {overBalance && (
              <p role="alert">That's more than this account has.</p>
            )}
            {cardSource && (
              <p role="alert">Transfers can't come from a credit card.</p>
            )}
            {formError && <p role="alert">{formError}</p>}

            <button type="button" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || overBalance || cardSource}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
        </dialog>
      )}
    </Layout>
  );
}

export default Transactions;
