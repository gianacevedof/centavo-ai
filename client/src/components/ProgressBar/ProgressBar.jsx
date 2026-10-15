// components/ProgressBar/ProgressBar.jsx
import styles from "./ProgressBar.module.css";

export default function ProgressBar({ value, max = 100, tone = "green" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={styles.track}>
      <div className={`${styles.fill} ${styles[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}