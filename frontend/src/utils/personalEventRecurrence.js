export const PERSONAL_RECURRENCE_WEEKS = 4;

export const PERSONAL_RECURRENCE_DAYS = Object.freeze([
  { id: 'monday', label: 'Lunedì', shortLabel: 'Lun', dayIndex: 1 },
  { id: 'tuesday', label: 'Martedì', shortLabel: 'Mar', dayIndex: 2 },
  { id: 'wednesday', label: 'Mercoledì', shortLabel: 'Mer', dayIndex: 3 },
  { id: 'thursday', label: 'Giovedì', shortLabel: 'Gio', dayIndex: 4 },
  { id: 'friday', label: 'Venerdì', shortLabel: 'Ven', dayIndex: 5 },
  { id: 'saturday', label: 'Sabato', shortLabel: 'Sab', dayIndex: 6 },
  { id: 'sunday', label: 'Domenica', shortLabel: 'Dom', dayIndex: 0 }
]);

export function createPersonalWeeklySchedule(defaultTime = '18:00') {
  return Object.fromEntries(PERSONAL_RECURRENCE_DAYS.map((day) => [day.id, {
    enabled: false,
    time: defaultTime,
    planId: ''
  }]));
}

export function getPersonalRecurrenceDayId(dateValue) {
  const date = new Date(`${String(dateValue || '')}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return PERSONAL_RECURRENCE_DAYS.find((day) => day.dayIndex === date.getDay())?.id || '';
}

export function getEnabledPersonalRecurrenceDays(schedule = {}) {
  return PERSONAL_RECURRENCE_DAYS.filter((day) => Boolean(schedule?.[day.id]?.enabled));
}

export function buildPersonalRecurrencePreview({
  startDate,
  schedule = {},
  weeks = PERSONAL_RECURRENCE_WEEKS
} = {}) {
  const start = new Date(`${String(startDate || '')}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const safeWeeks = Math.max(1, Math.min(12, Math.round(Number(weeks) || PERSONAL_RECURRENCE_WEEKS)));
  const finalDate = new Date(start);
  finalDate.setDate(finalDate.getDate() + safeWeeks * 7 - 1);
  const occurrences = [];

  for (const day = new Date(start); day <= finalDate; day.setDate(day.getDate() + 1)) {
    const definition = PERSONAL_RECURRENCE_DAYS.find((item) => item.dayIndex === day.getDay());
    const configuration = definition ? schedule?.[definition.id] : null;
    if (!definition || !configuration?.enabled) continue;
    occurrences.push({
      dayId: definition.id,
      label: definition.label,
      date: [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-'),
      time: String(configuration.time || ''),
      planId: String(configuration.planId || '')
    });
  }

  return occurrences;
}

export function getPersonalOccurrenceAvailability(dateValue, timeValue = '00:00') {
  const date = String(dateValue || '').trim();
  const time = /^\d{2}:\d{2}$/.test(String(timeValue || '').trim())
    ? String(timeValue).trim()
    : '00:00';
  const availableFrom = new Date(`${date}T${time}:00`);
  const availableUntil = new Date(`${date}T23:59:59.999`);
  if (Number.isNaN(availableFrom.getTime()) || Number.isNaN(availableUntil.getTime())) {
    return { availableFrom: null, availableUntil: null };
  }
  return {
    availableFrom: availableFrom.toISOString(),
    availableUntil: availableUntil.toISOString()
  };
}

export function serializePersonalWeeklySchedule(schedule = {}) {
  return Object.fromEntries(PERSONAL_RECURRENCE_DAYS.map((day) => {
    const configuration = schedule?.[day.id] || {};
    return [day.id, {
      enabled: Boolean(configuration.enabled),
      time: /^\d{2}:\d{2}$/.test(String(configuration.time || '').trim())
        ? String(configuration.time).trim()
        : '18:00',
      planId: String(configuration.planId || '').trim()
    }];
  }));
}
