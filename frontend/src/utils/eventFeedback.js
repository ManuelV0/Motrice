export function isEventFeedbackComplete(ratings = {}, includeOrganization = false) {
  const keys = ['punctuality', 'respect', 'collaboration', 'communication'];
  if (includeOrganization) keys.push('organization');
  return keys.every((key) => {
    const value = Number(ratings?.[key]);
    return Number.isInteger(value) && value >= 1 && value <= 5;
  });
}

export function getEventReviewAverage(review = {}) {
  if (review?.skipped) return null;
  const values = [
    review.punctuality_stars,
    review.respect_stars,
    review.collaboration_stars,
    review.communication_stars,
    review.organization_stars
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getPeerFeedbackAverage(reviews = []) {
  const averages = (Array.isArray(reviews) ? reviews : [])
    .map(getEventReviewAverage)
    .filter((value) => Number.isFinite(value));
  if (!averages.length) return null;
  return averages.reduce((sum, value) => sum + value, 0) / averages.length;
}

export function computeReliabilityWithPeer(objectiveScore, peerAverage, verifiedReviewCount = 1) {
  const objective = Math.max(0, Math.min(100, Number(objectiveScore) || 0));
  if (peerAverage == null || peerAverage === '') return objective;
  if (!Number.isFinite(Number(peerAverage))) return objective;
  const peer = Math.max(1, Math.min(5, Number(peerAverage))) * 20;
  const reviewCount = Math.max(0, Number(verifiedReviewCount) || 0);
  const peerWeight = Math.min(0.2, reviewCount * 0.02);
  return Math.round(Math.max(0, Math.min(100, objective * (1 - peerWeight) + peer * peerWeight)) * 100) / 100;
}
