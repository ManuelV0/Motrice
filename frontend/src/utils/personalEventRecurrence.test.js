import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPersonalRecurrencePreview,
  createPersonalWeeklySchedule,
  getEnabledPersonalRecurrenceDays,
  getPersonalOccurrenceAvailability,
  getPersonalRecurrenceDayId,
  serializePersonalWeeklySchedule
} from './personalEventRecurrence.js';

test('crea una settimana personale inizialmente vuota', () => {
  const schedule = createPersonalWeeklySchedule('19:30');
  assert.equal(Object.keys(schedule).length, 7);
  assert.equal(schedule.monday.time, '19:30');
  assert.equal(getEnabledPersonalRecurrenceDays(schedule).length, 0);
});

test('riconosce il giorno della data di avvio', () => {
  assert.equal(getPersonalRecurrenceDayId('2026-09-21'), 'monday');
  assert.equal(getPersonalRecurrenceDayId(''), '');
});

test('genera soltanto gli allenamenti configurati nelle quattro settimane', () => {
  const schedule = createPersonalWeeklySchedule();
  schedule.monday = { enabled: true, time: '18:00', planId: 'petto' };
  schedule.friday = { enabled: true, time: '19:00', planId: 'gambe' };
  const occurrences = buildPersonalRecurrencePreview({
    startDate: '2026-09-21',
    schedule,
    weeks: 4
  });

  assert.equal(occurrences.length, 8);
  assert.deepEqual(occurrences[0], {
    dayId: 'monday',
    label: 'Lunedì',
    date: '2026-09-21',
    time: '18:00',
    planId: 'petto'
  });
  assert.equal(occurrences.at(-1).date, '2026-10-16');
});

test('calcola la finestra flessibile dalla disponibilità fino a fine giornata', () => {
  const availability = getPersonalOccurrenceAvailability('2026-09-21', '18:30');
  assert.equal(new Date(availability.availableFrom).getHours(), 18);
  assert.equal(new Date(availability.availableFrom).getMinutes(), 30);
  assert.equal(new Date(availability.availableUntil).getHours(), 23);
  assert.equal(new Date(availability.availableUntil).getMinutes(), 59);
});

test('serializza soltanto valori prevedibili per il backend', () => {
  const schedule = serializePersonalWeeklySchedule({
    monday: { enabled: true, time: '07:30', planId: ' plan-1 ' },
    tuesday: { enabled: true, time: 'no', planId: null }
  });
  assert.deepEqual(schedule.monday, { enabled: true, time: '07:30', planId: 'plan-1' });
  assert.deepEqual(schedule.tuesday, { enabled: true, time: '18:00', planId: '' });
  assert.equal(Object.keys(schedule).length, 7);
});
