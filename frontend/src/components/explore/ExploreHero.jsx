import Button from '../Button';
import styles from '../../styles/components/exploreHero.module.css';

function ExploreHero({ onPrimaryAction, onSecondaryAction }) {
  return (
    <section className={styles.hero} aria-labelledby="explore-hero-title">
      <div className={styles.content}>
        <p className={styles.kicker}>Esplora</p>
        <h1 id="explore-hero-title">Trova sessioni sportive vicino a te</h1>
        <p className={styles.description}>
          Cerca per sport, orario e citta. Prenota in pochi tap e unisciti al gruppo.
        </p>
      </div>
      <div className={styles.actions}>
        <Button type="button" onClick={onPrimaryAction}>
          Trova sessioni vicino a me
        </Button>
        <Button type="button" variant="secondary" onClick={onSecondaryAction}>
          Come funziona
        </Button>
      </div>
    </section>
  );
}

export default ExploreHero;
