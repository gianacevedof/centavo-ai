import React from "react";
import { useState, useEffect } from "react";
import { api } from "../services/api";

function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        // Using a dummy user_id for now until auth is implemented
        const userId = 8; 
        
        const [accs, txs, bgs] = await Promise.all([
          api.fetchAccounts({ user_id: userId }),
          api.fetchTransactions({ user_id: userId, limit: 5 }), 
          api.fetchBudgets({ user_id: userId }),
        ]);

        setAccounts(accs);
        setTransactions(txs);
        setBudgets(bgs);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard-container">
      <header>
        <h1>Good morning, Giancarlo</h1>
      </header>

      <section className="balance-card">
        <h2>Total Balance</h2>
        <p className="balance-amount">${totalBalance.toFixed(2)}</p>
      </section>

      <section className="accounts-section">
        <h2>Your Accounts</h2>
        <ul>
          {accounts.length === 0 && <li>No accounts found</li>}
          {accounts.map((acct) => (
            <li key={acct.id} className="account-item">
              <span>{acct.name}</span>
              <span>${parseFloat(acct.balance).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="budgets-section">
        <h2>Monthly Budgets</h2>
        <ul>
          {budgets.length === 0 && <li>No budgets set yet</li>}
          {budgets.map((bg) => (
            <li key={bg.id} className="budget-item">
              <span>{bg.category_name}</span>
              <span>Limit: ${parseFloat(bg.monthly_limit).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="transactions-section">
        <h2>Recent Transactions</h2>
        <ul>
          {transactions.length === 0 && <li>No recent transactions</li>}
          {transactions.map((tx) => (
            <li key={tx.id} className="transaction-item">
              <span>{tx.date} - {tx.note || "No note"}</span>
              <span className={tx.type === "expense" ? "text-red" : "text-green"}>
                {tx.type === "expense" ? "-" : "+"}${parseFloat(tx.amount).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ai-insights-section">
        <h2>Ask Balance AI</h2>
        <div className="ai-buttons">
          <button>How am I doing this month?</button>
          <button>Am I over budget anywhere?</button>
          <button>Can I hit my savings goal?</button>
        </div>
        <div className="ai-response">
          <p>Click a question above to get an AI insight!</p>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
