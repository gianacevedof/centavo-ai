import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import Layout from "../components/Layout/Layout";
import Card from "../components/Card/Card";
import ProgressBar from "../components/ProgressBar/ProgressBar";
import EmptyState from "../components/EmptyState/EmptyState";
import styles from "./Overview.module.css";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function currentDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function capitalizeFirst(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : "User";
}

function Overview() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // AUTH CHECK
        const { user: me } = await api.fetchMe();
        setUser(me);
      } catch {
        navigate("/login");
        return;
      }

      try {
        const [accs, txs, bgs] = await Promise.all([
          api.fetchAccounts(),
          api.fetchTransactions({ limit: 3 }),
          api.fetchBudgets(),
        ]);
        setAccounts(accs);
        setTransactions(txs);
        setBudgets(bgs);
      } catch (err) {
        console.error("Overview load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum + parseFloat(a.balance || 0),
    0
  );

  const getCategoryColor = (name) => {
    const colors = ["#c4453a", "#2d7a5f", "#d99a2b", "#4a7fc4", "#6b7280", "#8b5cf6"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  if (loading) return <Layout><div className={styles.loading}>Loading...</div></Layout>;

  return (
    <Layout
      title={`${greeting()}, ${capitalizeFirst(user?.name)}`}
      subtitle={currentDate()}
    >
      <div className={styles.dashboardGrid}>
        
        {/* ================= LEFT COLUMN ================= */}
        <div className={styles.mainColumn}>
          
          {/* Hero Card */}
          <section className={styles.hero}>
            <div className={styles.heroLeft}>
              <span className={styles.heroLabel}>TOTAL BALANCE</span>
              <p className={styles.heroAmount}>
                ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </section>

          {/* Accounts */}
          <Card title="Accounts" action="Click to edit goals">
            {accounts.length === 0 ? (
              <EmptyState
                icon="🏦"
                title="No accounts yet"
                description="Connect your bank or add a manual account to get started."
              />
            ) : (
              <ul className={styles.accountList}>
                {accounts.map((acc) => {
                  const balance = parseFloat(acc.balance || 0);
                  return (
                    <li key={acc.id} className={styles.accountRow}>
                      <div className={styles.accountIcon}>▤</div>
                      <div className={styles.accountInfo}>
                        <span className={styles.accountName}>{acc.name}</span>
                        <div className={styles.accountBarWrapper}>
                          <ProgressBar value={Math.abs(balance)} max={5000} tone={balance < 0 ? "red" : "green"} />
                        </div>
                        <span className={styles.accountMeta}>{acc.type || "Checking"}</span>
                      </div>
                      <span className={styles.accountBalance}>${balance.toFixed(2)}</span>
                      <span className={styles.chevron}>›</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Budgets */}
          <Card title="Budgets & goals" action="Monthly">
            {budgets.length === 0 ? (
              <EmptyState 
                icon="🎯" 
                title="No budgets set" 
                description="Set a monthly limit for your categories to track spending."
              />
            ) : (
              <ul className={styles.budgetList}>
                {budgets.slice(0, 3).map((bg) => {
                  const limit = parseFloat(bg.monthly_limit || 0);
                  const spent = parseFloat(bg.spent || 0);
                  const pct = limit ? (spent / limit) * 100 : 0;
                  const status = pct > 100 ? "Over budget" : pct > 85 ? "Close" : "On target";
                  const tone = pct > 100 ? "red" : pct > 85 ? "amber" : "green";
                  return (
                    <li key={bg.id} className={styles.budgetRow}>
                      <span className={styles.budgetName}>{bg.category_name}</span>
                      <div className={styles.budgetBarWrapper}>
                        <ProgressBar value={spent} max={limit} tone={tone} />
                      </div>
                      <span className={styles.budgetMeta}>${spent} / ${limit}</span>
                      <span className={`${styles.budgetStatus} ${styles[tone]}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Recent Transactions */}
          <Card title="Recent transactions" action="View all">
            {transactions.length === 0 ? (
              <EmptyState 
                icon="💸" 
                title="No recent transactions" 
                description="Your latest transactions will appear here."
              />
            ) : (
              <ul className={styles.txList}>
                {transactions.map((tx) => {
                  const isExpense = tx.type === "expense";
                  const catColor = getCategoryColor(tx.category_name || "Uncategorized");
                  return (
                    <li key={tx.id} className={styles.txRow}>
                      <div className={styles.txAvatar} style={{ backgroundColor: catColor }} />
                      <div className={styles.txInfo}>
                        <span className={styles.txNote}>{tx.note || "No note"}</span>
                        <span className={styles.txCategory}>{tx.category_name || "Uncategorized"}</span>
                      </div>
                      <span className={isExpense ? styles.txExpense : styles.txIncome}>
                        {isExpense ? "−" : "+"}${parseFloat(tx.amount).toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ================= RIGHT RAIL ================= */}
        <div className={styles.rightRail}>
          <Card title="Centavo-ai tips" action="UPDATED">
            <div className={`${styles.tipCard} ${styles.tipGreen}`}>
              <strong>Ready to get started?</strong>
              <p>Add your first transaction to start receiving personalized AI tips.</p>
              <span className={styles.tipAction}>ADD TRANSACTION →</span>
            </div>
          </Card>

        </div>
      </div>
    </Layout>
  );
}

export default Overview;
