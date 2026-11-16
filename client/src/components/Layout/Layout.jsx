import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import ChatPanel from "../ChatPanel/ChatPanel";
import { api } from "../../services/api";
import styles from "./Layout.module.css";

const NAV_ITEMS = [
  { 
    to: "/", 
    label: "Overview", 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
    )
  },
  { 
    to: "/transactions", 
    label: "Transactions", 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"></line>
        <line x1="8" y1="12" x2="21" y2="12"></line>
        <line x1="8" y1="18" x2="21" y2="18"></line>
        <line x1="3" y1="6" x2="3.01" y2="6"></line>
        <line x1="3" y1="12" x2="3.01" y2="12"></line>
        <line x1="3" y1="18" x2="3.01" y2="18"></line>
      </svg>
    )
  },
  { 
    to: "/budgets", 
    label: "Budgets", 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    )
  },
  { 
    to: "/trends", 
    label: "Trends", 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
      </svg>
    )
  },
  { 
    to: "/settings", 
    label: "Profile", 
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    )
  },
];

export default function Layout({ children, title, subtitle }) {
  const [planHealth, setPlanHealth] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [showCheckIn, setShowCheckIn] = useState(false);
  
  // Dynamic Account Data
  const [accountsToReview, setAccountsToReview] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);

  // ... (Keep all your existing logic: useEffect for data, handleBalanceChange, etc.)
  // To save space here, I am assuming you kept the logic from the previous message.
  // Just make sure the `return` statement matches what's below.

  // Calculate dynamic net total
  const netTotal = accountsToReview.reduce((sum, acc) => sum + parseFloat(acc.new_balance || 0), 0);
  
  const finalSubtitle = `${subtitle ? subtitle + ' · ' : ''}Your plan is ${planHealth}% on track`;

  return (
    <div className={styles.layout}>
      
      {/* Desktop Sidebar */}
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
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.checkIn}>
          <div className={styles.checkInTitle}>Weekly check-in</div>
          <p className={styles.checkInText}>Review and update balances every Sunday.</p>
          <span className={styles.checkInBadge}>● NOTIFICATIONS ON</span>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            <p className={styles.pageSubtitle}>{finalSubtitle}</p>
          </div>

          <div className={styles.topBarRight}>
            <input className={styles.search} type="search" placeholder="Search transactions, goals..." />
            <button className={styles.reviewButton} onClick={() => setShowCheckIn(true)}>
              Review & corrections
              {reviewCount > 0 && <span className={styles.reviewCount}>{reviewCount}</span>}
            </button>
            <Link to="/settings" className={styles.avatar} aria-label="Profile and settings" />
          </div>
        </header>

        <div className={styles.content}>
          {children}
          <ChatPanel />
        </div>
      </main>

      {/* ===== MOBILE BOTTOM NAVIGATION ===== */}
      <nav className={styles.mobileNav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              isActive ? `${styles.mobileNavItem} ${styles.mobileNavItemActive}` : styles.mobileNavItem
            }
          >
            <span className={styles.mobileIcon}>{item.icon}</span>
            <span className={styles.mobileLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ================= REVIEW & CORRECTIONS MODAL ================= */}
      {/* ... (Keep the exact same modal logic you already have here) ... */}
    </div>
  );
}
