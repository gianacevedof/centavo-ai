// components/Layout/Layout.jsx
import { NavLink, Link } from "react-router-dom";
import styles from "./Layout.module.css";

const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  // { to: "/accounts", label: "Accounts" },
  { to: "/budgets", label: "Budgets & Goals" },
  { to: "/transactions", label: "Transactions" },
  // { to: "/trends", label: "Trends" },
  { to: "/settings", label: "Settings" },
];

export default function Layout({ children, title, subtitle }) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>C</div>
          <span className={styles.brandName}>Centavo-ai</span>
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
              Review & corrections <span className={styles.reviewCount}>3</span>
            </button>
            <Link
              to="/settings"
              className={styles.avatar}
              aria-label="Profile and settings"
            />
          </div>
        </header>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
