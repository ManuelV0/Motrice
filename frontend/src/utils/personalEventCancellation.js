export function isRecurringPersonalEvent(event) {
  return Boolean(event?.is_personal && String(event?.personal_series_id || '').trim());
}

export function normalizeCancellationScope(scope, event) {
  return scope === 'series' && isRecurringPersonalEvent(event) ? 'series' : 'single';
}

export function getFuturePersonalSeriesEvents(events, event, referenceMs = Date.now()) {
  if (!isRecurringPersonalEvent(event)) return [];

  const seriesId = String(event.personal_series_id);
  const creatorId = String(event.created_by ?? event.organizerId ?? event.creator_id ?? '');

  return (Array.isArray(events) ? events : [])
    .filter((candidate) => {
      if (!candidate?.is_personal) return false;
      if (String(candidate.personal_series_id || '') !== seriesId) return false;
      if (String(candidate.status || 'scheduled') !== 'scheduled') return false;

      const candidateCreatorId = String(
        candidate.created_by ?? candidate.organizerId ?? candidate.creator_id ?? ''
      );
      if (creatorId && candidateCreatorId && creatorId !== candidateCreatorId) return false;

      const startsAt = Date.parse(candidate.event_datetime || candidate.starts_at || '');
      return Number.isFinite(startsAt) && startsAt > referenceMs;
    })
    .sort((left, right) => (
      Date.parse(left.event_datetime || left.starts_at || '')
      - Date.parse(right.event_datetime || right.starts_at || '')
    ));
}
