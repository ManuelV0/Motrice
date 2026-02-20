const SPORT_IMAGE_MAP = {
  running: '/images/running.svg',
  padel: '/images/padel.svg',
  calcio: '/images/calcio.svg',
  bici: '/images/bici.svg',
  palestra: '/images/palestra.svg',
  trekking: '/images/trekking.svg'
};

function normalizeSport(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getSportImage(sportName) {
  const key = normalizeSport(sportName);
  return SPORT_IMAGE_MAP[key] || '/images/default-sport.svg';
}
