export const NAVBAR_SCROLL_LIMITS = Object.freeze({
  expandNearTopPx: 24,
  compactAfterPx: 64,
  compactTravelPx: 16,
  expandTravelPx: 10
});

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
