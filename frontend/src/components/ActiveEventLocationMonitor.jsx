import { useEffect, useState } from 'react';
import { Activity, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from '../styles/components/activeEventLocationMonitor.module.css';

function ActiveEventLocationMonitor({ enabled }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTracking, setActiveTracking] = useState(null);

  useEffect(() => {
    let disposed = false;
    let removeLifecycle = () => {};
    let removeStatusListener = () => {};
    let timer = null;

    import('../services/eventLocationTracking').then((tracking) => {
      if (disposed) return;
      if (!enabled) {
        setActiveTracking(null);
        tracking.stopEventLocationTracking({ status: 'interrupted', reason: 'logout' }).catch(() => undefined);
        return;
      }

      const refreshStatus = (event) => {
        setActiveTracking(event?.detail ?? tracking.getActiveEventLocationTracking());
      };
      setActiveTracking(tracking.getActiveEventLocationTracking());
      window.addEventListener(tracking.EVENT_LOCATION_TRACKING_STATUS_EVENT, refreshStatus);
      removeStatusListener = () => {
        window.removeEventListener(tracking.EVENT_LOCATION_TRACKING_STATUS_EVENT, refreshStatus);
      };
      removeLifecycle = tracking.installEventLocationTrackingLifecycle();
      timer = window.setInterval(() => {
        tracking.resumeEventLocationTracking()
          .then((status) => setActiveTracking(status))
          .catch(() => undefined);
      }, 30000);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      removeStatusListener();
      removeLifecycle();
    };
  }, [enabled]);

  const onActivityScreen = /^\/events\/[^/]+\/activity$/.test(location.pathname);
  const isOutdoorSession = Boolean(activeTracking?.eventId && activeTracking?.activityKind);
  if (!enabled || !isOutdoorSession || onActivityScreen) return null;

  const interrupted = activeTracking.status === 'interrupted' || activeTracking.status === 'permission_denied';
  return (
    <button
      type="button"
      className={styles.resumeButton}
      data-warning={interrupted ? 'true' : 'false'}
      onClick={() => navigate(`/events/${activeTracking.eventId}/activity`)}
      aria-label={`Riapri attività live ${activeTracking.eventTitle || ''}`.trim()}
    >
      <span className={styles.icon}><Activity size={19} aria-hidden="true" /></span>
      <span className={styles.copy}>
        <small>EVENTO IN CORSO</small>
        <strong>{activeTracking.eventTitle || 'Allenamento in corso'}</strong>
      </span>
      <span className={styles.liveDot} aria-hidden="true" />
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

export default ActiveEventLocationMonitor;
