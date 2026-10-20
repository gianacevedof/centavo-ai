import React, { useState, useEffect, useCallback } from "react";
// Note: Adjusted imports since this file is directly in /pages
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import styles from "./Transactions.module.css";

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", account: "" });
  const [loading, setLoading] = useState(true);

  // Load accounts and categories for the filter dropdowns
  useEffect(() => {
    async function loadLookupData() {
      try {
        const [accs, cats] = await Promise.all([
          api.fetchAccounts(),
          api.fetchCategories(),
        ]);
        setAccounts(Array.from(new Map(accs.map((a) => [a.name, a])).values()));
        setCategories(Array.from(new Map(cats.map((c) => [c.name, c])).values()));
      } catch (err) {
        console.error("Failed to load lookup data:", err);
      }
    }
    loadLookupData();
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.fetchTransactions(filters);
      setTransactions(data);
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

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

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
        </div>

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
            <span className={styles.textPurple}>+${(income - expenses).toFixed(2)}</span>
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
    </Layout>
  );
}

export default Transactions;