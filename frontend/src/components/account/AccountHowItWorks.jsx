import styles from '../../styles/components/accountHowItWorks.module.css';

function AccountHowItWorks({ compact = false }) {
  return (
    <section className={`${styles.section} ${compact ? styles.compact : ''}`} aria-label="Come funziona account">
      <h2>Come funziona</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Completa profilo</strong>
          <p>Aggiungi bio, immagine e disponibilita chat se sei coach.</p>
        </li>
        <li>
          <strong>Monitora XP e badge</strong>
          <p>Controlla progressione, attivita recenti e sport principali.</p>
        </li>
        <li>
          <strong>Gestisci piano</strong>
          <p>Attiva Free, Rewarded o Premium in base alle tue esigenze.</p>
        </li>
      </ol>
    </section>
  );
}

export default AccountHowItWorks;
