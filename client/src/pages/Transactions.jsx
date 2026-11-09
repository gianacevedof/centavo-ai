import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Transactions.module.css";

const TRANSFER = "transfer";
const SAVINGS = "savings";
const PAGE_SIZE = 10;

function dedupeByName(list) {
  return Array.from(new Map(list.map((item) => [item.name, item])).values());
}

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toYMD(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function presetRange(preset) {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - (preset === "last7" ? 6 : 29));
  return { from: toYMD(start), to: toYMD(today) };
}

function formatDay(value) {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function emptyForm() {
  return {
    type: "expense",
    amount: "",
    account_id: "",
    to_account_id: "",
    category_id: "",
    savings_goal_id: "",
    date: todayLocal(),
    note: "",
  };
}

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountNameById, setAccountNameById] = useState(new Map());
  const [categories, setCategories] = useState([]);
  const [goals, setGoals] = useState([]);
  const [filters, setFilters] = useState({ category: "", account: "" });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);

  const [datePreset, setDatePreset] = useState("last30");
  const [range, setRange] = useState(() => presetRange("last30"));
  const [customDraft, setCustomDraft] = useState({ from: "", to: "" });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLookupData = useCallback(async () => {
    try {
      const [accs, cats, gls] = await Promise.all([
        api.fetchAccounts(),
        api.fetchCategories(),
        api.fetchSavingsGoals ? api.fetchSavingsGoals() : Promise.resolve([]),
      ]);
      setAccounts(dedupeByName(accs));
      setAccountNameById(new Map(accs.map((a) => [Number(a.id), a.name])));
      setCategories(dedupeByName(cats));
      setGoals(gls);
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
      const data = await api.fetchTransactions({ ...filters, from: range.from, to: range.to });
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
  }, [filters, range]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ category: "", account: "" });
    setDatePreset("last30");
    setRange(presetRange("last30"));
    setPage(1);
  };

  const pickPreset = (preset) => {
    setDatePreset(preset);
    if (preset === "custom") {
      setCustomDraft({ from: range.from, to: range.to });
    } else {
      setRange(presetRange(preset));
      setPage(1);
    }
  };

  const applyCustomRange = () => {
    if (!customDraft.from || !customDraft.to || customDraft.from > customDraft.to) return;
    setRange({ from: customDraft.from, to: customDraft.to });
    setPage(1);
  };

  const customInvalid = !customDraft.from || !customDraft.to || customDraft.from > customDraft.to;

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const pageRows = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showingStart = transactions.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, transactions.length);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const getCategoryName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const getAccountName = (id) => accountNameById.get(Number(id)) || "Unknown";

  const getCategoryColor = (name) => {
    const colors = ["#c4453a", "#2d7a5f", "#d99a2b", "#4a7fc4", "#6b7280", "#8b5cf6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const isTransfer = form.type === TRANSFER;
  const isSavings = form.type === SAVINGS;
  const sourceAccount = accounts.find((a) => String(a.id) === String(form.account_id));
  const amountNum = Number(form.amount);
  const cardSource = isTransfer && sourceAccount?.type === "credit_card";
  const overBalance = isTransfer && sourceAccount && amountNum > parseFloat(sourceAccount.balance);

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

  function checkForm() {
    if (!form.account_id) return "Pick an account.";
    if (!(amountNum > 0)) return "Amount must be greater than 0.";
    if (!form.date) return "Pick a date.";
    
    if (isTransfer) {
      if (!form.to_account_id) return "Pick a destination account.";
      if (form.to_account_id === form.account_id) return "Pick two different accounts.";
      if (cardSource) return "Transfers can't come from a credit card.";
      if (overBalance) return "That's more than this account has.";
    } else if (isSavings) {
      if (!form.savings_goal_id) return "Pick a savings goal.";
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
        : isSavings 
          ? { savings_goal_id: Number(form.savings_goal_id) }
          : { category_id: Number(form.category_id) }),
    };

    setSaving(true);
    setFormError("");
    try {
      await api.createTransaction(payload);
      setShowForm(false);
      setNotice(isTransfer ? "Transfer saved." : isSavings ? "Savings contribution saved." : "Transaction saved.");
      await Promise.all([loadLookupData(), loadTransactions()]);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const net = income - expenses;

  return (
    <Layout title="Transactions" subtitle="Tuesday, September 15 · Your plan is 82% on track">
      <div className={styles.container}>

        <div className={styles.topBar}>
          <div className={styles.filtersGroup}>
            <select className={styles.filterSelect} name="date" value={datePreset} onChange={(e) => pickPreset(e.target.value)}>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom range</option>
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
          <button className={styles.primaryBtn} onClick={openForm}>+ Add transaction</button>
        </div>

        {datePreset === "custom" && (
          <div className={styles.customRange}>
            <label htmlFor="range-from">From</label>
            <input id="range-from" type="date" value={customDraft.from} onChange={(e) => setCustomDraft((d) => ({ ...d, from: e.target.value }))} />
            <label htmlFor="range-to">To</label>
            <input id="range-to" type="date" value={customDraft.to} onChange={(e) => setCustomDraft((d) => ({ ...d, to: e.target.value }))} />
            <button type="button" className={styles.outlineBtn} onClick={applyCustomRange} disabled={customInvalid}>Apply</button>
          </div>
        )}

        <p className={styles.dateShowing}>Showing {formatDay(range.from)} to {formatDay(range.to)}</p>

        {notice && <p className={styles.notice}>{notice}</p>}

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
            <span className={styles.textPurple}>{net < 0 ? "-" : "+"}${Math.abs(net).toFixed(2)}</span>
          </div>
        </div>

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
                  pageRows.map((tx) => {
                    const catName = getCategoryName(tx.category_id);
                    const fromName = tx.account_name || getAccountName(tx.account_id);
                    const accountLabel = tx.type === "transfer" ? `${fromName} → ${getAccountName(tx.to_account_id)}` : fromName;
                    return (
                      <tr key={tx.id}>
                        <td className={styles.dateCell}>{formatDay(tx.date)}</td>
                        <td className={styles.descCell}>{tx.note || "No description"}</td>
                        <td>
                          <div className={styles.categoryCell}>
                            <span className={styles.dot} style={{ backgroundColor: getCategoryColor(catName) }} />
                            {catName}
                          </div>
                        </td>
                        <td className={styles.accountCell}>{accountLabel}</td>
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

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>Showing {showingStart}-{showingEnd} of {transactions.length} transactions</span>
            <div className={styles.pageButtons}>
              <button className={styles.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={n === page ? `${styles.pageBtn} ${styles.pageBtnActive}` : styles.pageBtn} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button className={styles.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        </Card>
      </div>

      {/* ===== REDESIGNED MODAL ===== */}
      {showForm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Add transaction</h2>
              <button className={styles.closeBtn} onClick={closeForm}>✕</button>
            </div>
            <p className={styles.modalSubtitle}>Add the details that keep your plan accurate.</p>

            <form onSubmit={handleSubmit}>
              <div className={styles.modalTabs}>
                <button type="button" className={`${styles.modalTab} ${form.type === "expense" ? styles.modalTabActive : ""}`} onClick={() => updateForm("type", "expense")}>Expense</button>
                <button type="button" className={`${styles.modalTab} ${form.type === "income" ? styles.modalTabActive : ""}`} onClick={() => updateForm("type", "income")}>Income</button>
                <button type="button" className={`${styles.modalTab} ${form.type === "transfer" ? styles.modalTabActive : ""}`} onClick={() => updateForm("type", "transfer")}>Transfer</button>
                <button type="button" className={`${styles.modalTab} ${form.type === "savings" ? styles.modalTabActive : ""}`} onClick={() => updateForm("type", "savings")}>Savings</button>
              </div>

              {isTransfer ? (
                <>
                  <div className={styles.formGroup}>
                    <label>From</label>
                    <select value={form.account_id} onChange={(e) => updateForm("account_id", e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (${parseFloat(a.balance || 0).toFixed(2)})</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>To</label>
                    <select value={form.to_account_id} onChange={(e) => updateForm("to_account_id", e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.filter((a) => String(a.id) !== String(form.account_id)).map((a) => <option key={a.id} value={a.id}>{a.name} (${parseFloat(a.balance || 0).toFixed(2)})</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Amount</label>
                    <input type="number" step="0.01" value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} placeholder="$ 0.00" />
                  </div>
                </>
              ) : isSavings ? (
                <>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Amount *</label>
                      <input type="number" step="0.01" value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} placeholder="$ 0.00" />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Date *</label>
                      <input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>From Account *</label>
                    <select value={form.account_id} onChange={(e) => updateForm("account_id", e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Savings Goal *</label>
                    <select value={form.savings_goal_id} onChange={(e) => updateForm("savings_goal_id", e.target.value)}>
                      <option value="">Select a goal</option>
                      {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Note (optional)</label>
                    <input type="text" value={form.note} onChange={(e) => updateForm("note", e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Amount *</label>
                      <input type="number" step="0.01" value={form.amount} onChange={(e) => updateForm("amount", e.target.value)} placeholder="$ 0.00" />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Date *</label>
                      <input type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>{isTransfer ? "From account" : "Account"}</label>
                      <select value={form.account_id} onChange={(e) => updateForm("account_id", e.target.value)}>
                        <option value="">Select account</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Category (optional)</label>
                      <select value={form.category_id} onChange={(e) => updateForm("category_id", e.target.value)}>
                        <option value="">Select category</option>
                        {categories.filter((c) => c.name !== "Transfer").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Note (optional)</label>
                    <input type="text" value={form.note} onChange={(e) => updateForm("note", e.target.value)} />
                  </div>
                </>
              )}

              {formError && <p className={styles.errorText}>{formError}</p>}
              {overBalance && <p className={styles.errorText}>That's more than this account has.</p>}
              {cardSource && <p className={styles.errorText}>Transfers can't come from a credit card.</p>}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.outlineBtn} onClick={closeForm} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={saving || overBalance || cardSource}>
                  {saving ? "Saving..." : "Add Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Transactions;
