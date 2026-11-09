// components/Layout/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import ChatPanel from "../ChatPanel/ChatPanel";
import { api } from "../../services/api"; // Make sure api is imported
import styles from "./Layout.module.css";

const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  { to: "/budgets", label: "Budgets & Goals" },
  { to: "/transactions", label: "Transactions" },
  { to: "/trends", label: "Trends" },
  { to: "/settings", label: "Settings" },
];

export default function Layout({ children, title, subtitle }) {
  const [reviewCount, setReviewCount] = useState(0);

  // Fetch transactions to calculate the "Review & Corrections" count
  useEffect(() => {
    async function checkCorrections() {
      try {
        const txs = await api.fetchTransactions({ limit: 100 }); 
        // Rule: A transaction needs review if it has no category
        // (You can add more rules here later, like checking for missing notes or AI flags)
        const needsReview = txs.filter((tx) => !tx.category_id).length;
        setReviewCount(needsReview);
      } catch (err) {
        console.error("Failed to calculate review count:", err);
      }
    }
    checkCorrections();
  }, [title]); // Re-run whenever the page changes

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>C</div>
          <span className={styles.brandName}>Centavo</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                isActive
                  ? `${styles.navItem} ${styles.navItemActive}`
                  : styles.navItem
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.checkIn}>
          <div className={styles.checkInTitle}>Weekly check-in</div>
          <p className={styles.checkInText}>
            Review and update balances every Sunday.
          </p>
          <span className={styles.checkInBadge}>● NOTIFICATIONS ON</span>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
          </div>

          <div className={styles.topBarRight}>
            <input
              className={styles.search}
              type="search"
              placeholder="Search transactions, goals..."
            />
            <button className={styles.reviewButton}>
              Review & corrections
              {/* Only show the badge if the count is greater than 0 */}
              {reviewCount > 0 && (
                <span className={styles.reviewCount}>{reviewCount}</span>
              )}
            </button>
            <Link
              to="/settings"
              className={styles.avatar}
              aria-label="Profile and settings"
            />
          </div>
        </header>

        <div className={styles.content}>
          {children}
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
