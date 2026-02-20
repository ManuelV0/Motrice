import styles from '../../styles/components/exploreHowItWorks.module.css';

function ExploreHowItWorks({ compact = false }) {
  return (
    <section className={`${styles.section} ${compact ? styles.compact : ''}`} aria-label="Come funziona esplora">
      <h2>Come funziona</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Scegli una sessione</strong>
          <p>Usa ricerca e filtri per trovare lo slot giusto.</p>
        </li>
        <li>
          <strong>Prenota o salva</strong>
          <p>Blocca il posto nel gruppo o salva in agenda.</p>
        </li>
        <li>
          <strong>Partecipa e conferma</strong>
          <p>Presentati all'evento e mantieni alta affidabilita.</p>
        </li>
      </ol>
    </section>
  );
}

export default ExploreHowItWorks;
