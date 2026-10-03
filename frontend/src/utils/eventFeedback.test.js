import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReliabilityWithPeer,
  getEventReviewAverage,
  getPeerFeedbackAverage,
  isEventFeedbackComplete
} from './eventFeedback.js';

test('richiede quattro parametri e anche organizzazione per l organizer', () => {
  const ratings = { punctuality: 5, respect: 4, collaboration: 5, communication: 4, organization: 0 };
  assert.equal(isEventFeedbackComplete(ratings, false), true);
  assert.equal(isEventFeedbackComplete(ratings, true), false);
  assert.equal(isEventFeedbackComplete({ ...ratings, organization: 5 }, true), true);
});

test('ignora i salti e calcola la media solo sui giudizi verificati', () => {
  const complete = {
    punctuality_stars: 5,
    respect_stars: 4,
    collaboration_stars: 5,
    communication_stars: 4,
    organization_stars: null
  };
  assert.equal(getEventReviewAverage(complete), 4.5);
  assert.equal(getEventReviewAverage({ ...complete, skipped: true }), null);
  assert.equal(getPeerFeedbackAverage([complete, { ...complete, skipped: true }]), 4.5);
});

test('aumenta gradualmente il peso dei giudizi fino a un massimo del 20 percento', () => {
  assert.equal(computeReliabilityWithPeer(90, 5, 1), 90.2);
  assert.equal(computeReliabilityWithPeer(90, 1, 1), 88.6);
  assert.equal(computeReliabilityWithPeer(90, 5, 10), 92);
  assert.equal(computeReliabilityWithPeer(90, 1, 10), 76);
  assert.equal(computeReliabilityWithPeer(120, 5, 10), 100);
  assert.equal(computeReliabilityWithPeer(85, null), 85);
});
