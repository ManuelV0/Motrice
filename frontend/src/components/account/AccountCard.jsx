import Card from '../Card';
import styles from '../../styles/components/accountCard.module.css';

function AccountCard({ title, subtitle = '', actions = null, className = '', children }) {
  return (
    <Card className={`${styles.card} ${className}`.trim()}>
      <header className={styles.head}>
        <div className={styles.copy}>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </Card>
  );
}

export default AccountCard;
