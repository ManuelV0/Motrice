import styles from '../styles/components/howItWorksConvenzioni.module.css';

function HowItWorksConvenzioni({ title = 'Come funziona', compact = false }) {
  return (
    <section className={`${styles.block} ${compact ? styles.compact : ''}`} aria-label={title}>
      <h2>{title}</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Scegli la convenzione</strong>
          <p>Filtra per sport o citta e apri la scheda partner.</p>
        </li>
        <li>
          <strong>Apri il QR (valido 90 min)</strong>
          <p>Il voucher costa 2 EUR dal saldo reinvestito.</p>
        </li>
        <li>
          <strong>Mostralo e fallo validare</strong>
          <p>In palestra o associazione, il partner convalida il codice.</p>
        </li>
      </ol>
    </section>
  );
}

export default HowItWorksConvenzioni;
