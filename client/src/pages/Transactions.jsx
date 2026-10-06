import React, { useState, useEffect } from "react";
import { api } from "../services/api";

function Transactions() {
  const [transactions, setTransactions] = useState([]);
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
              <option value="28">Main Checking</option>
              <option value="29">Savings Account</option>
              <option value="30">Visa Credit</option>
              <option value="31">Cash Wallet</option>
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
              <option value="1">Food</option>
              <option value="2">Transport</option>
              <option value="3">Dining</option>
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
          <option value="1">Food</option>
          <option value="2">Transport</option>
          <option value="3">Dining</option>
        </select>

        <select
          name="account"
          value={filters.account}
          onChange={handleFilterChange}
        >
          <option value="">All Accounts</option>
          <option value="28">Main Checking</option>
          <option value="29">Savings Account</option>
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
