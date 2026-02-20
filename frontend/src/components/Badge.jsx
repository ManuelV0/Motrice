import styles from '../styles/components/badge.module.css';

function Badge({ tone = 'sport', className = '', children }) {
  const classes = String(tone || 'sport')
    .split(' ')
    .filter(Boolean)
    .map((item) => styles[item] || '')
    .join(' ');

  return <span className={`${styles.badge} ${classes} ${className}`.trim()}>{children}</span>;
}

export default Badge;
