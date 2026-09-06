import { useEffect } from 'react';

function ActiveEventLocationMonitor({ enabled }) {
  useEffect(() => {
    let disposed = false;
    let removeLifecycle = () => {};
    let timer = null;

    import('../services/eventLocationTracking').then((tracking) => {
      if (disposed) return;
      if (!enabled) {
        tracking.stopEventLocationTracking({ status: 'interrupted', reason: 'logout' }).catch(() => undefined);
        return;
      }

      removeLifecycle = tracking.installEventLocationTrackingLifecycle();
      timer = window.setInterval(() => {
        tracking.resumeEventLocationTracking().catch(() => undefined);
      }, 30000);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      removeLifecycle();
    };
  }, [enabled]);

  return null;
}

export default ActiveEventLocationMonitor;
