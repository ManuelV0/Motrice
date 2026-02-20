import { TrainFront } from 'lucide-react';
import styles from '../styles/components/trainTrack.module.css';

function TrainTrack() {
  return (
    <section className={styles.widget} aria-label="Percorso da Point A a Point B">
      <div className={styles.head}>
        <p className={styles.title}>Motrice Route</p>
        <p className={styles.meta}>Point A to Point B</p>
      </div>

      <div className={styles.track} role="img" aria-label="Treno in movimento orizzontale da Point A verso Point B">
        <div className={styles.line} aria-hidden="true" />

        <div className={`${styles.node} ${styles.nodeA}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>Point A</span>
        </div>

        <div className={`${styles.node} ${styles.nodeB}`}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>Point B</span>
        </div>

        <div className={styles.trainLane} aria-hidden="true">
          <div className={styles.train}>
            <TrainFront size={18} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default TrainTrack;
