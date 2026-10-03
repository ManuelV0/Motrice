import { MapPinned } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import styles from '../styles/components/locationPermissionAlert.module.css';

function LocationPermissionAlert({ hasLocation, permission, error, requesting, onRequest, compact = false }) {
  if (hasLocation) return null;

  const isDenied = permission === 'denied';
  const description = isDenied
    ? error || 'Posizione negata. Attiva il permesso per vedere eventi davvero vicini a te.'
    : error || 'Attiva la posizione per trovare eventi e coach vicino a te su mappa ed esplora.';

  return (
    <Card className={`${styles.wrap} ${isDenied ? styles.denied : ''} ${compact ? styles.compact : ''}`} role="status" aria-live="polite">
      <div className={styles.head}>
        <span className={styles.iconBubble}>
          <MapPinned size={18} aria-hidden="true" />
        </span>
        <div className={styles.copy}>
          <strong>Attiva la posizione</strong>
          {!compact ? <p className="muted">{description}</p> : <p className="muted">Abilita la distanza reale dall’evento</p>}
        </div>
      </div>

      <Button type="button" size="sm" onClick={onRequest} disabled={requesting}>
        {requesting ? 'Attivazione...' : 'Attiva'}
      </Button>
    </Card>
  );
}

export default LocationPermissionAlert;
