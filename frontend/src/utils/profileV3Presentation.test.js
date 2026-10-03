import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileRecentActivity,
  resolveProfileAchievements
} from './profileV3Presentation.js';

test('host achievement follows the real organized-event count', () => {
  const locked = resolveProfileAchievements({ hostEvents: 0 });
  const unlocked = resolveProfileAchievements({ hostEvents: 55 });

  assert.equal(locked.find((item) => item.id === 'host').unlocked, false);
  assert.equal(unlocked.find((item) => item.id === 'host').unlocked, true);
  assert.equal(unlocked.find((item) => item.id === 'host').detail, 'Sbloccato');
});

test('profile activity uses the XP value sharing the same ledger reference', () => {
  const result = buildProfileRecentActivity({
    motLogs: [{ id: 1, mot: 5, motivo: 'checkin_qr', ref_key: 'checkin:event-1', created_at: '2026-09-30T10:00:00Z' }],
    xpLogs: [{ id: 9, xp: 25, motivo: 'Check-in QR verificato', ref_key: 'checkin:event-1', created_at: '2026-09-30T10:00:00Z' }]
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].subtitle, '+5 MOT · +25 XP');
});

test('XP-only rewards remain visible and are never attached to unrelated MOT logs', () => {
  const result = buildProfileRecentActivity({
    motLogs: [{ id: 1, mot: 3, motivo: 'workout_60_percent', ref_key: 'workout:60:event-1', created_at: '2026-09-30T10:00:00Z' }],
    xpLogs: [{ id: 9, xp: 25, motivo: 'Allenamento completato', ref_key: 'workout:complete:event-1', created_at: '2026-09-30T10:30:00Z' }]
  });

  assert.deepEqual(result.map((item) => item.subtitle), ['+25 XP', '+3 MOT']);
});
