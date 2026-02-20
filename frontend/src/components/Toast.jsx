import styles from '../styles/components/toast.module.css';

function Toast({ children, tone = 'info' }) {
  const toneClass = tone === 'success' ? styles.success : tone === 'error' ? styles.error : styles.info;
  return <div className={`${styles.toast} ${toneClass}`}>{children}</div>;
}

export default Toast;
