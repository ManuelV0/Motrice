import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import styles from '../styles/components/pullToRefresh.module.css';

const ACTIVATION_DISTANCE = 68;
const MAX_DISTANCE = 108;
const MAP_EDGE_LIMIT = 156;
const RESET_DELAY_MS = 650;

function isGestureBlocked(target) {
  return Boolean(
    target?.closest?.(
      [
        'input',
        'textarea',
        'select',
        '[contenteditable="true"]',
        '[data-pull-refresh-ignore]',
        '.mapboxgl-canvas-container',
        '.mapboxgl-control-container',
        '.leaflet-container'
      ].join(',')
    )
  );
}

function isScrollPositionAtTop(target) {
  let node = target instanceof Element ? target : null;

  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const scrollable = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;

    if (scrollable) {
      return node.scrollTop <= 1;
    }

    node = node.parentElement;
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  return (scrollingElement?.scrollTop || window.scrollY || 0) <= 1;
}

function PullToRefresh({ enabled, edgeOnly = false, fullscreen = false, routeKey, onRefresh }) {
  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState('idle');
  const gestureRef = useRef(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  useEffect(() => {
    refreshingRef.current = phase === 'refreshing';
  }, [phase]);

  useEffect(() => {
    setDistance(0);
    setPhase('idle');
    gestureRef.current = null;
  }, [routeKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    const reset = () => {
      gestureRef.current = null;
      distanceRef.current = 0;
      setDistance(0);
      if (!refreshingRef.current) setPhase('idle');
    };

    const handleTouchStart = (event) => {
      if (refreshingRef.current || event.touches.length !== 1 || isGestureBlocked(event.target)) return;

      const touch = event.touches[0];
      if (edgeOnly && touch.clientY > MAP_EDGE_LIMIT) return;
      if (!isScrollPositionAtTop(event.target)) return;

      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        target: event.target,
        vertical: null
      };
    };

    const handleTouchMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || refreshingRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (gesture.vertical === null && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
        gesture.vertical = Math.abs(deltaY) > Math.abs(deltaX) * 1.15;
      }

      if (gesture.vertical === false || deltaY <= 0 || !isScrollPositionAtTop(gesture.target)) {
        reset();
        return;
      }

      if (gesture.vertical !== true) return;

      const resistedDistance = Math.min(MAX_DISTANCE, Math.max(0, deltaY * 0.48));
      distanceRef.current = resistedDistance;
      setDistance(resistedDistance);
      setPhase(resistedDistance >= ACTIVATION_DISTANCE ? 'ready' : 'pulling');

      if (event.cancelable) event.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!gestureRef.current || refreshingRef.current) return;
      gestureRef.current = null;

      if (distanceRef.current < ACTIVATION_DISTANCE) {
        reset();
        return;
      }

      refreshingRef.current = true;
      setPhase('refreshing');
      setDistance(54);

      Promise.resolve(onRefresh?.())
        .then(() => {
          setPhase('complete');
          setDistance(50);
        })
        .catch(() => {
          setPhase('error');
          setDistance(50);
        })
        .finally(() => {
          resetTimerRef.current = window.setTimeout(() => {
            refreshingRef.current = false;
            distanceRef.current = 0;
            setDistance(0);
            setPhase('idle');
          }, RESET_DELAY_MS);
        });
    };

    const handleTouchCancel = () => {
      if (!refreshingRef.current) reset();
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, [edgeOnly, enabled, onRefresh]);

  const visible = distance > 0 || phase === 'refreshing' || phase === 'complete' || phase === 'error';
  const progress = Math.min(1, distance / ACTIVATION_DISTANCE);
  const label =
    phase === 'ready'
      ? 'Rilascia per aggiornare'
      : phase === 'refreshing'
        ? 'Aggiornamento…'
        : phase === 'complete'
          ? 'Contenuti aggiornati'
          : phase === 'error'
            ? 'Aggiornamento non riuscito'
            : 'Trascina per aggiornare';

  return (
    <div
      className={`${styles.indicator} ${visible ? styles.visible : ''} ${fullscreen ? styles.fullscreen : ''}`}
      style={{ '--pull-distance': `${distance}px`, '--pull-opacity': Math.max(0.18, progress) }}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <span className={`${styles.icon} ${phase === 'refreshing' ? styles.spinning : ''}`}>
        {phase === 'complete' ? (
          <Check size={18} strokeWidth={2.8} aria-hidden="true" />
        ) : (
          <RefreshCw
            size={18}
            strokeWidth={2.4}
            aria-hidden="true"
            style={{ transform: phase === 'refreshing' ? undefined : `rotate(${progress * 210}deg)` }}
          />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default PullToRefresh;
