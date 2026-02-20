import { MapPinned, Navigation } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import styles from '../styles/components/locationPermissionAlert.module.css';

function LocationPermissionAlert({ hasLocation, permission, error, requesting, onRequest }) {
  if (hasLocation) return null;

  const isDenied = permission === 'denied';
  const description = isDenied
    ? error || 'Posizione negata. Attiva il permesso per vedere eventi davvero vicini a te.'
    : error || 'Attiva la posizione per trovare eventi e coach vicino a te su mappa ed esplora.';

  return (
    <Card className={`${styles.wrap} ${isDenied ? styles.denied : ''}`} role="status" aria-live="polite">
      <div className={styles.head}>
        <span className={styles.iconBubble}>
          <MapPinned size={18} aria-hidden="true" />
        </span>
        <div className={styles.copy}>
          <strong>Attiva la posizione</strong>
          <p className="muted">{description}</p>
        </div>
      </div>

      <Button type="button" size="sm" icon={Navigation} onClick={onRequest} disabled={requesting}>
        {requesting ? 'Richiesta posizione...' : 'Attiva posizione'}
      </Button>
    </Card>
  );
}

export default LocationPermissionAlert;
