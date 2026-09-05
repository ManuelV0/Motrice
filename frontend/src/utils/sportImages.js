const SPORT_IMAGE_MAP = {
  running: '/images/running.svg',
  padel: '/images/padel.svg',
  calcio: '/images/calcio.svg',
  bici: '/images/bici.svg',
  palestra: '/images/palestra.svg',
  'palestra outdoor': '/images/palestra.svg',
  trekking: '/images/trekking.svg'
};

const SPORT_HERO_IMAGE_MAP = [
  { pattern: /palestra|fitness|forza|functional|workout|hiit/i, image: '/images/hero-palestra-v2.jpg' },
  { pattern: /padel|tennis|racchetta/i, image: '/images/hero-padel-v2.jpg' },
  { pattern: /calcio|calcetto|football|futsal/i, image: '/images/hero-calcio-v2.jpg' },
  { pattern: /running|corsa|jogging/i, image: '/images/hero-running-v2.jpg' },
  { pattern: /bici|bike|cycling|ciclismo|mtb/i, image: '/images/hero-bici-v2.jpg' },
  { pattern: /trekking|trail|hiking|camminata/i, image: '/images/hero-trekking-v2.jpg' }
];

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

export function getSportHeroImage(sportName, title = '') {
  const source = `${normalizeSport(sportName)} ${normalizeSport(title)}`;
  return (
    SPORT_HERO_IMAGE_MAP.find((item) => item.pattern.test(source))?.image ||
    '/images/hero-sport-default-v2.jpg'
  );
}
