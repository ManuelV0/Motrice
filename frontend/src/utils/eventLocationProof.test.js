import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEventLocationAccuracyLimit,
  validateEventLocationProof
} from './eventLocationProof.js';

const NOW = 1789032000000;
const EVENT = { eventLat: 42.8596487, eventLng: 13.5702482, radiusM: 250, nowMs: NOW };

test('adatta la precisione richiesta al raggio senza superare cento metri', () => {
  assert.equal(getEventLocationAccuracyLimit(50), 35);
  assert.equal(getEventLocationAccuracyLimit(120), 60);
  assert.equal(getEventLocationAccuracyLimit(250), 100);
  assert.equal(getEventLocationAccuracyLimit(1000), 100);
});

test('accetta una posizione fresca e precisa dentro l area evento', () => {
  const result = validateEventLocationProof({
    ...EVENT,
    location: {
      lat: 42.8597,
      lng: 13.5703,
      accuracy: 12,
      capturedAt: NOW - 2000
    }
  });
  assert.equal(result.valid, true);
  assert.equal(result.code, 'inside_event_area');
});

test('rifiuta una posizione precedente anche se era dentro l area', () => {
  const result = validateEventLocationProof({
    ...EVENT,
    location: {
      lat: 42.8597,
      lng: 13.5703,
      accuracy: 12,
      capturedAt: NOW - 90000
    }
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'stale_location');
});

test('rifiuta un segnale troppo impreciso', () => {
  const result = validateEventLocationProof({
    ...EVENT,
    location: {
      lat: 42.8597,
      lng: 13.5703,
      accuracy: 180,
      capturedAt: NOW - 1000
    }
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'inaccurate_location');
});

test('rifiuta una posizione fisicamente fuori dal raggio', () => {
  const result = validateEventLocationProof({
    ...EVENT,
    location: {
      lat: 42.8697,
      lng: 13.5703,
      accuracy: 10,
      capturedAt: NOW - 1000
    }
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'outside_event_area');
});

test('considera anche il margine di accuratezza vicino al bordo', () => {
  const result = validateEventLocationProof({
    ...EVENT,
    location: {
      lat: 42.86165,
      lng: 13.57025,
      accuracy: 40,
      capturedAt: NOW - 1000
    }
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'outside_event_area');
});
