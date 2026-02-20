import Card from '../Card';
import Button from '../Button';
import styles from '../../styles/components/accountFeaturedActions.module.css';

function AccountFeaturedActions({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <section className={styles.section} aria-label="Azioni consigliate">
      <div className={styles.head}>
        <h2>In primo piano</h2>
        <p>Azioni consigliate per completare il profilo e migliorare l'esperienza.</p>
      </div>
      <div className={styles.grid}>
        {actions.map((action) => (
          <Card key={action.id} className={styles.item}>
            <h3>{action.title}</h3>
            <p>{action.description}</p>
            <Button type="button" variant={action.variant || 'secondary'} onClick={action.onClick} disabled={Boolean(action.disabled)}>
              {action.label}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default AccountFeaturedActions;
