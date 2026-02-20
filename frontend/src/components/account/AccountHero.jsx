import Button from '../Button';
import styles from '../../styles/components/accountHero.module.css';

function AccountHero({ onPrimaryAction, onSecondaryAction }) {
  return (
    <section className={styles.hero} aria-labelledby="account-hero-title">
      <div className={styles.content}>
        <p className={styles.kicker}>Area personale</p>
        <h1 id="account-hero-title">Gestisci il tuo Account Motrice</h1>
        <p className={styles.description}>
          Profilo, XP, piano e tutorial in un unico flusso chiaro e veloce.
        </p>
      </div>
      <div className={styles.actions}>
        <Button type="button" onClick={onPrimaryAction}>
          Completa profilo
        </Button>
        <Button type="button" variant="secondary" onClick={onSecondaryAction}>
          Come funziona
        </Button>
      </div>
    </section>
  );
}

export default AccountHero;
