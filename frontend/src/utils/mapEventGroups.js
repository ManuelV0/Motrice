function normalizeVenuePart(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ');
}

function getRecurringVenueKey(event) {
  const location = normalizeVenuePart(event?.location_name);
  const city = normalizeVenuePart(event?.city);
  const lat = Number(event?.lat);
  const lng = Number(event?.lng);
  const coordinates = Number.isFinite(lat) && Number.isFinite(lng)
    ? `${lat.toFixed(4)}:${lng.toFixed(4)}`
    : '';
  return `${location}:${city}:${coordinates}`;
}

function getEventTimestamp(event) {
  const timestamp = Date.parse(event?.event_datetime || event?.starts_at || '');
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function compareEvents(left, right) {
  const timeDifference = getEventTimestamp(left) - getEventTimestamp(right);
  if (timeDifference !== 0) return timeDifference;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

/**
 * Keeps every real occurrence intact while presenting one map entry for each
 * recurring series at a given venue. The earliest occurrence becomes the map
 * representative and carries the other dates for the expandable summary.
 */
export function groupRecurringMapEvents(events = []) {
  const standaloneEvents = [];
  const recurringGroups = new Map();

  events.forEach((event) => {
    const seriesId = String(event?.personal_series_id || '').trim();
    if (!seriesId) {
      standaloneEvents.push(event);
      return;
    }

    const groupKey = `${seriesId}:${getRecurringVenueKey(event)}`;
    const group = recurringGroups.get(groupKey) || [];
    group.push(event);
    recurringGroups.set(groupKey, group);
  });

  const recurringEvents = [...recurringGroups.entries()].map(([groupKey, group]) => {
    const occurrences = [...group].sort(compareEvents);
    const nextOccurrence = occurrences[0];
    return {
      ...nextOccurrence,
      is_recurring_group: true,
      recurring_group_key: groupKey,
      recurring_series_id: nextOccurrence.personal_series_id,
      recurring_occurrence_count: occurrences.length,
      recurring_occurrence_ids: occurrences.map((event) => String(event.id)),
      recurring_occurrences: occurrences
    };
  });

  return [...standaloneEvents, ...recurringEvents].sort(compareEvents);
}

