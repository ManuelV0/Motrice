export const ASSOCIATION_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'>" +
      "<defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>" +
      "<stop offset='0%' stop-color='#fff7e6'/><stop offset='100%' stop-color='#e8eef8'/></linearGradient></defs>" +
      "<rect width='1200' height='700' fill='url(#g)'/>" +
      "<circle cx='1060' cy='90' r='190' fill='#ffdca8' fill-opacity='0.55'/>" +
      "<circle cx='120' cy='620' r='220' fill='#d6e7ff' fill-opacity='0.55'/>" +
      "<rect x='80' y='110' width='560' height='84' rx='16' fill='#ffffff' fill-opacity='0.88'/>" +
      "<text x='112' y='162' fill='#243447' font-size='42' font-family='Arial, sans-serif' font-weight='700'>Motrice Partner</text>" +
      "<rect x='80' y='226' width='920' height='60' rx='12' fill='#ffffff' fill-opacity='0.76'/>" +
      "<text x='112' y='266' fill='#4f6172' font-size='28' font-family='Arial, sans-serif'>Immagine struttura non disponibile</text>" +
      "<rect x='80' y='510' width='220' height='54' rx='27' fill='#ffffff' fill-opacity='0.88'/>" +
      "<text x='124' y='545' fill='#2f4558' font-size='26' font-family='Arial, sans-serif' font-weight='700'>Associazione</text>" +
    "</svg>"
  );

export function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'n/d';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function eur(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} EUR`;
}

export function getBadgeLabel(value) {
  const key = String(value || 'rame').toLowerCase();
  if (key === 'diamante') return 'Diamante';
  if (key === 'oro') return 'Oro';
  if (key === 'argento') return 'Argento';
  if (key === 'bronzo') return 'Bronzo';
  return 'Rame';
}
