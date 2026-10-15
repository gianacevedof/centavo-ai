// pages/Dashboard/Dashboard.jsx
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import Layout from "../../components/Layout/Layout";
import Card from "../../components/Card/Card";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import styles from "./Dashboard.module.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pace, setPace] = useState("moderate");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const userId = 3; // TODO: replace with auth
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
    load();
  }, []);

  const totalBalance = accounts.reduce(
    (sum, a) => sum + parseFloat(a.balance || 0),
    0
  );

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className={styles.loading}>Loading dashboard...</div>
      </Layout>
    );
  }

  return (
    <Layout
      title={`${greeting()}, Giancarlo`}
      subtitle={new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
    >
      <div className={styles.grid}>
        {/* ===== MAIN COLUMN ===== */}
        <div className={styles.mainColumn}>
          {/* Hero: Total balance */}
          <section className={styles.hero}>
            <div className={styles.heroTop}>
              <span className={styles.heroLabel}>Total Balance</span>
              <div className={styles.heroRight}>
                <span className={styles.heroLabel}>Goal pace</span>
                <div className={styles.paceToggle}>
                  {["slow", "moderate", "fast"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPace(p)}
                      className={`${styles.paceButton} ${
                        pace === p ? styles.paceButtonActive : ""
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className={styles.heroAmount}>
              ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className={styles.heroDelta}>
              ↗ $1,240 this month · $30k by June 2027
            </p>
          </section>

          {/* Accounts */}
          <Card title="Accounts" action="Click to edit goals">
            <ul className={styles.accountList}>
              {accounts.length === 0 && <li>No accounts yet</li>}
              {accounts.map((acc) => {
                const balance = parseFloat(acc.balance || 0);
                const max = Math.max(...accounts.map((a) => Math.abs(parseFloat(a.balance || 0))), 1);
                return (
                  <li key={acc.id} className={styles.accountRow}>
                    <div className={styles.accountIcon} />
                    <div className={styles.accountInfo}>
                      <span className={styles.accountName}>{acc.name}</span>
                      <span className={styles.accountMeta}>
                        {acc.type || "Account"}
                      </span>
                    </div>
                    <ProgressBar
                      value={Math.abs(balance)}
                      max={max}
                      tone={balance < 0 ? "red" : "green"}
                    />
                    <span className={styles.accountBalance}>
                      ${balance.toFixed(2)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Budgets */}
          <Card title="Budgets & goals" action="Monthly">
            <ul className={styles.budgetList}>
              {budgets.length === 0 && <li>No budgets set yet</li>}
              {budgets.map((bg) => {
                const limit = parseFloat(bg.monthly_limit || 0);
                const spent = parseFloat(bg.spent || 0);
                const pct = limit ? (spent / limit) * 100 : 0;
                const status =
                  pct > 100 ? "Over budget" : pct > 85 ? "Close" : "On target";
                const tone = pct > 100 ? "red" : pct > 85 ? "amber" : "green";
                return (
                  <li key={bg.id} className={styles.budgetRow}>
                    <span className={styles.budgetName}>{bg.category_name}</span>
                    <ProgressBar value={spent} max={limit} tone={tone} />
                    <span className={styles.budgetMeta}>
                      ${spent.toFixed(0)} / ${limit.toFixed(0)}
                    </span>
                    <span className={`${styles.budgetStatus} ${styles[tone]}`}>
                      {status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Recent transactions */}
          <Card title="Recent transactions" action="View all">
            <ul className={styles.txList}>
              {transactions.length === 0 && <li>No recent transactions</li>}
              {transactions.map((tx) => {
                const isExpense = tx.type === "expense";
                return (
                  <li key={tx.id} className={styles.txRow}>
                    <div className={styles.txAvatar} />
                    <div className={styles.txInfo}>
                      <span className={styles.txNote}>
                        {tx.note || "No note"}
                      </span>
                      <span className={styles.txCategory}>
                        {tx.category_name || "Uncategorized"}
                      </span>
                    </div>
                    <span
                      className={
                        isExpense ? styles.txAmountExpense : styles.txAmountIncome
                      }
                    >
                      {isExpense ? "−" : "+"}$
                      {parseFloat(tx.amount).toFixed(2)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        {/* ===== RIGHT RAIL ===== */}
        <div className={styles.rightRail}>
          {/* Plan health */}
          <Card title="Plan health">
            <div className={styles.planHealth}>
              <div className={styles.donut}>
                <span className={styles.donutValue}>82%</span>
              </div>
              <p className={styles.planText}>
                You're within range on 7 of 9 monthly goals.
              </p>
            </div>
          </Card>

          {/* AI tips */}
          <Card title="Centavo-ai tips" action="Updated">
            <div className={styles.tipCard}>
              <strong>Ease dining spend this week</strong>
              <p>Spend $18 less per day to bring food & dining back on balance by Sunday.</p>
              <button className={styles.tipAction}>Adjust budget →</button>
            </div>
            <div className={`${styles.tipCard} ${styles.tipCardMuted}`}>
              <strong>Move your checking surplus</strong>
              <p>Transfer $300 to Rainy day fund and reach your goal three weeks sooner.</p>
              <button className={styles.tipAction}>Review transfer →</button>
            </div>
          </Card>

          {/* Review & corrections */}
          <Card title="Review & corrections" action="3 items">
            <ul className={styles.reviewList}>
              <li>⚠ Categorize Metro Energy</li>
              <li>⚠ Confirm cash balance</li>
              <li>⚠ Review shopping target</li>
            </ul>
          </Card>

          {/* Ask Centavo-ai */}
          <Card title="Ask Centavo-ai">
            <p className={styles.askText}>
              How can I get my shopping budget back on track?
            </p>
            <div className={styles.askInput}>
              <input placeholder="Try 'forecast my year'" />
              <button aria-label="Send">→</button>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

export default Dashboard;
