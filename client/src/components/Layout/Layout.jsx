import { NavLink, Link } from "react-router-dom";
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
    to: "/budgets",
    label: "Budgets & Goals",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2v10h10"></path>
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
    to: "/trends",
    label: "Trends",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
      </svg>
    )
  },
];

const SETTINGS_ITEM = {
  to: "/settings",
  label: "Profile and settings",
  mobileLabel: "Settings",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 2 2.2 3-.1.8 2.9 2.6 1.6-1 2.8 1 2.8-2.6 1.6-.8 2.9-3-.1L12 21l-2-2.2-3 .1-.8-2.9-2.6-1.6 1-2.8-1-2.8 2.6-1.6.8-2.9 3 .1L12 2Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  ),
};

const ALL_NAV_ITEMS = [...NAV_ITEMS, SETTINGS_ITEM];

export default function Layout({ children, title, subtitle }) {
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
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <nav className={styles.sidebarFooter}>
          <NavLink
            to={SETTINGS_ITEM.to}
            className={({ isActive }) =>
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
          >
            <span className={styles.navIcon}>{SETTINGS_ITEM.icon}</span>
            <span>{SETTINGS_ITEM.label}</span>
          </NavLink>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
          </div>

          <div className={styles.topBarRight}>
            <Link to="/settings" className={styles.avatar} aria-label="Settings" />
          </div>
        </header>

        <div className={styles.content}>
          {children}
        </div>
      </main>

      <nav className={styles.mobileNav}>
        {ALL_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              isActive ? `${styles.mobileNavItem} ${styles.mobileNavItemActive}` : styles.mobileNavItem
            }
          >
            <span className={styles.mobileIcon}>{item.icon}</span>
            <span className={styles.mobileLabel}>{item.mobileLabel || item.label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
