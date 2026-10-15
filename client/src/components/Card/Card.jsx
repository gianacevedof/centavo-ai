// components/Card/Card.jsx
import styles from "./Card.module.css";

export default function Card({ title, action, children, className = "" }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {(title || action) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action && <button className={styles.action}>{action}</button>}
        </header>
      )}
      {children}
    </section>
  );
}