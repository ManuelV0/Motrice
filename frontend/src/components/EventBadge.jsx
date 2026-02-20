import Badge from './Badge';

function EventBadge({ label, type = 'sport' }) {
  const slug = String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');

  return <Badge tone={type === 'sport' ? `sport ${`sport-${slug}`}` : type}>{label}</Badge>;
}

export default EventBadge;
