import { useEffect, useRef, useState } from 'react';

function normalizeValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function AnimatedNumber({
  value,
  duration = 420,
  decimals = 0,
  formatter,
  className,
  ariaLabel
}) {
  const target = normalizeValue(value);
  const [displayValue, setDisplayValue] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const startValue = displayRef.current;
    if (reduceMotion || duration <= 0 || Math.abs(target - startValue) < 10 ** -(decimals + 1)) {
      displayRef.current = target;
      setDisplayValue(target);
      return undefined;
    }

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = startValue + (target - startValue) * eased;
      displayRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [decimals, duration, target]);

  const rendered = typeof formatter === 'function'
    ? formatter(displayValue)
    : displayValue.toLocaleString('it-IT', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });

  return <span className={className} aria-label={ariaLabel}>{rendered}</span>;
}

export default AnimatedNumber;
