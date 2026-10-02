export const NAVBAR_SCROLL_LIMITS = Object.freeze({
  expandNearTopPx: 24,
  compactAfterPx: 64,
  compactTravelPx: 16,
  expandTravelPx: 10
});

export function getNavbarScrollY() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  return Math.max(0, window.scrollY || document.scrollingElement?.scrollTop || 0);
}

function isNavbarTextEntryActive() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const activeElement = document.activeElement;
  if (!(activeElement instanceof window.HTMLElement)) return false;
  if (activeElement.isContentEditable) return true;
  if (activeElement.matches('textarea, select')) return true;
  if (!activeElement.matches('input')) return false;
  return ![
    'button',
    'checkbox',
    'color',
    'date',
    'file',
    'hidden',
    'month',
    'radio',
    'range',
    'reset',
    'submit',
    'time',
    'week'
  ].includes(String(activeElement.type || '').toLowerCase());
}

export function isNavbarScrollCompactionBlocked() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const visualViewport = window.visualViewport;
  const keyboardVisible = visualViewport
    ? window.innerHeight - visualViewport.height > 120
    : false;

  return document.documentElement.classList.contains('mobile-menu-open')
    || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
    || keyboardVisible
    || isNavbarTextEntryActive();
}

export function createNavbarScrollState(scrollY = 0) {
  const normalizedY = Math.max(0, Number(scrollY) || 0);
  return {
    compact: false,
    direction: null,
    distance: 0,
    scrollY: normalizedY
  };
}

export function advanceNavbarScrollState(
  state,
  scrollY,
  { enabled = true, blocked = false } = {}
) {
  const current = state || createNavbarScrollState(scrollY);
  const nextY = Math.max(0, Number(scrollY) || 0);

  if (!enabled || blocked || nextY <= NAVBAR_SCROLL_LIMITS.expandNearTopPx) {
    return {
      compact: false,
      direction: null,
      distance: 0,
      scrollY: nextY
    };
  }

  const delta = nextY - current.scrollY;
  if (Math.abs(delta) < 0.5) {
    return { ...current, scrollY: nextY };
  }

  const direction = delta > 0 ? 'down' : 'up';
  const distance = direction === current.direction
    ? current.distance + Math.abs(delta)
    : Math.abs(delta);
  let compact = current.compact;
  let remainingDistance = distance;

  if (
    direction === 'down'
    && nextY >= NAVBAR_SCROLL_LIMITS.compactAfterPx
    && distance >= NAVBAR_SCROLL_LIMITS.compactTravelPx
  ) {
    compact = true;
    remainingDistance = 0;
  } else if (direction === 'up' && distance >= NAVBAR_SCROLL_LIMITS.expandTravelPx) {
    compact = false;
    remainingDistance = 0;
  }

  return {
    compact,
    direction,
    distance: remainingDistance,
    scrollY: nextY
  };
}
