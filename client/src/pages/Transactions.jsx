import React, { useState, useEffect } from "react";
import { api } from "../services/api";

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    user_id: 3,
    category: "",
    account: "",
    limit: 50,
  });
  const [loading, setLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    amount: "",
    category_id: "",
    account_id: "",
    date: new Date().toISOString().split("T")[0],
    note: "",
    type: "expense",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    async function loadLookupData() {
      try {
        const [accs, cats] = await Promise.all([
          api.fetchAccounts({ user_id: 3 }),
          api.fetchCategories(),
        ]);

        // Deduplicate accounts and categories by name to prevent UI duplicates
        const uniqueAccs = Array.from(
          new Map(accs.map((a) => [a.name, a])).values(),
        );
        const uniqueCats = Array.from(
          new Map(cats.map((c) => [c.name, c])).values(),
        );

        setAccounts(uniqueAccs);
        setCategories(uniqueCats);
      } catch (err) {
        console.error("Failed to load lookup data:", err);
      }
    }

    loadLookupData();
  }, []);

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true);
      try {
        const data = await api.fetchTransactions(filters);
        setTransactions(data);
      } catch (err) {
        console.error("Failed to load transactions:", err);
      } finally {
        setLoading(false);
      }
    }

    loadTransactions();
  }, [filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ user_id: 3, category: "", account: "", limit: 50 });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createTransaction({
        ...formData,
        user_id: 3,
        amount: parseFloat(formData.amount),
      });
      // Reset form
      setFormData({
        amount: "",
        category_id: "",
        account_id: "",
        date: new Date().toISOString().split("T")[0],
        note: "",
        type: "expense",
      });
      // Refresh list
      await loadTransactions();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // I define this as a separate function to reuse it in useEffect and handleSubmit
  async function loadTransactions() {
    setLoading(true);
    try {
      const data = await api.fetchTransactions(filters);
      setTransactions(data);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleAiParse = async (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    setIsParsing(true);
    try {
      const result = await api.parseAIInput(aiInput);
      setFormData((prev) => ({
        ...prev,
        amount: result.amount || prev.amount,
        category_id: result.category_id || prev.category_id,
        account_id: result.account_id || prev.account_id,
        date: result.date || prev.date,
        note: result.note || prev.note,
        type: result.type || prev.type,
      }));
      setAiInput("");
    } catch (err) {
      alert(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  if (loading) return <div className="loading">Loading transactions...</div>;

  return (
    <div className="transactions-page">
      <header>
        <h1>Transactions</h1>
      </header>

      <section className="add-transaction-form">
        <h2>Add Transaction</h2>
        <form
          className="ai-prompt-bar"
          onSubmit={handleAiParse}
          style={{ marginBottom: "20px", display: "flex", gap: "10px" }}
        >
          <input
            type="text"
            placeholder="Try 'Spent $12 on lunch'..."
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
          <button type="submit" disabled={isParsing}>
            {isParsing ? "Parsing..." : "AI Magic ✨"}
          </button>
        </form>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amount</label>
            <input
              type="number"
              step="0.01"
              name="amount"
              value={formData.amount}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleInputChange}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div className="form-group">
            <label>Account</label>
            <select
              name="account_id"
              value={formData.account_id}
              onChange={handleInputChange}
              required
            >
              <option value="">Select Account</option>
              <option value="7">Main Checking</option>
              <option value="8">Savings Account</option>
              <option value="9">Personal Credit Card</option>
              <option value="10">Cash Wallet</option>
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select
              name="category_id"
              value={formData.category_id}
              onChange={handleInputChange}
            >
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Note</label>
            <input
              type="text"
              name="note"
              value={formData.note}
              onChange={handleInputChange}
            />
          </div>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Add Transaction"}
          </button>
        </form>
      </section>

      <section className="filters-bar">
        <select
          name="category"
          value={filters.category}
          onChange={handleFilterChange}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <select
          name="account"
          value={filters.account}
          onChange={handleFilterChange}
        >
          <option value="">All Accounts</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        <button onClick={clearFilters}>Clear Filters</button>
      </section>

      <section className="summary-cards">
        <div className="card">
          <p>Period Income</p>
          <p className="text-green">${income.toFixed(2)}</p>
        </div>
        <div className="card">
          <p>Period Expenses</p>
          <p className="text-red">${expenses.toFixed(2)}</p>
        </div>
        <div className="card">
          <p>Net Savings</p>
          <p>${(income - expenses).toFixed(2)}</p>
        </div>
      </section>

      <section className="transactions-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.date}</td>
                  <td>{tx.note || "No note"}</td>
                  <td>{tx.category_id}</td>
                  <td>{tx.account_id}</td>
                  <td
                    className={
                      tx.type === "expense" ? "text-red" : "text-green"
                    }
                  >
                    {tx.type === "expense" ? "-" : "+"}$
                    {parseFloat(tx.amount).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Transactions;
