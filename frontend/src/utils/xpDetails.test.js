import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalXpDetails } from './xpDetails.js';

test('uses the canonical profile XP instead of a stale legacy total', () => {
  const result = buildCanonicalXpDetails(
    {
      xp_global: 570,
      xp_by_sport: { 1: 570 },
      xp_history: [{ id: 'legacy', points: 570 }]
    },
    {
      xp: {
        total: 100,
        logs: [{ id: 7, xp: 100, motivo: 'Allenamento completato', created_at: '2026-09-25T10:00:00Z' }]
      }
    }
  );

  assert.equal(result.xp_global, 100);
  assert.deepEqual(result.xp_by_sport, { generic: 100 });
  assert.equal(result.badge.key, 'bronzo');
  assert.deepEqual(result.progress, {
    currentXp: 100,
    currentThreshold: 0,
    nextThreshold: 250,
    progressPct: 40,
    level: 1
  });
  assert.equal(result.xp_history[0].points, 100);
  assert.equal(result.xp_history[0].label, 'Allenamento completato');
});

test('keeps the sport breakdown when it matches the canonical total', () => {
  const result = buildCanonicalXpDetails(
    { xp_global: 100, xp_by_sport: { 1: 75, 2: 25 }, xp_history: [] },
    { xp: { total: 100, logs: [] } }
  );

  assert.deepEqual(result.xp_by_sport, { 1: 75, 2: 25 });
});
