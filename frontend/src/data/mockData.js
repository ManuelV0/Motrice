const now = Date.now();
const hour = 60 * 60 * 1000;
const day = 24 * hour;

function atOffset(hoursOffset) {
  return new Date(now + hoursOffset * hour).toISOString();
}

function inDays(daysOffset, hourOfDay = 18) {
  const date = new Date(now + daysOffset * day);
  date.setHours(hourOfDay, 0, 0, 0);
  return date.toISOString();
}

export const seededSports = [
  { id: 1, slug: 'running', name: 'Running' },
  { id: 2, slug: 'padel', name: 'Padel' },
  { id: 3, slug: 'calcio', name: 'Calcio' },
  { id: 4, slug: 'palestra', name: 'Palestra' },
  { id: 5, slug: 'bici', name: 'Bici' },
  { id: 6, slug: 'trekking', name: 'Trekking' }
];

export const seededProfiles = [
  {
    id: 1,
    name: 'Giulia Bianchi',
    city: 'Roma',
    bio: 'Runner urbana e organizer di sessioni sociali.',
    goal: 'fitness',
    reliability_score: 96,
    no_show_count: 1,
    availability: [
      { day: 'Lunedi', start: '18:30', end: '20:30' },
      { day: 'Giovedi', start: '07:00', end: '08:30' }
    ],
    sports_practiced: [
      { sport_id: 1, sport_name: 'Running', level: 'intermediate' },
      { sport_id: 6, sport_name: 'Trekking', level: 'beginner' }
    ]
  },
  {
    id: 2,
    name: 'Luca Ferrari',
    city: 'Milano',
    bio: 'Padel addict, sempre pronto per un doppio competitivo.',
    goal: 'performance',
    reliability_score: 92,
    no_show_count: 2,
    availability: [{ day: 'Martedi', start: '19:00', end: '22:00' }],
    sports_practiced: [
      { sport_id: 2, sport_name: 'Padel', level: 'advanced' },
      { sport_id: 4, sport_name: 'Palestra', level: 'intermediate' }
    ]
  }
];

export const seededHotspots = [
  { id: 'h1', name: 'Villa Borghese Park', city: 'Roma', type: 'Park', lat: 41.9142, lng: 12.4923 },
  { id: 'h2', name: 'Parco Sempione', city: 'Milano', type: 'Park', lat: 45.4726, lng: 9.1797 },
  { id: 'h3', name: 'Giardini Margherita', city: 'Bologna', type: 'Park', lat: 44.4855, lng: 11.3561 },
  { id: 'h4', name: 'Passetto', city: 'Ancona', type: 'Run Spot', lat: 43.6158, lng: 13.5281 },
  { id: 'h5', name: 'Parco Annunziata', city: 'Ascoli Piceno', type: 'Park', lat: 42.8494, lng: 13.5856 },
  { id: 'h6', name: 'Lungomare Sud', city: 'San Benedetto del Tronto', type: 'Run Spot', lat: 42.9444, lng: 13.8918 },
  { id: 'h7', name: 'Pescara Bike Hub', city: 'Pescara', type: 'Cycling', lat: 42.4618, lng: 14.2161 },
  { id: 'h8', name: 'Cascine Track', city: 'Firenze', type: 'Run Spot', lat: 43.7804, lng: 11.2208 },
  { id: 'h9', name: 'Foro Italico Courts', city: 'Roma', type: 'Padel', lat: 41.9339, lng: 12.4548 },
  { id: 'h10', name: 'Arena Civica Zone', city: 'Milano', type: 'Calisthenics', lat: 45.4781, lng: 9.1807 },
  { id: 'h11', name: 'Stadio del Conero Trail', city: 'Ancona', type: 'Trekking', lat: 43.5536, lng: 13.5444 }
];

const baseEvents = [
  [101, 1, 'Running', 'beginner', atOffset(1.5), 'Lungotevere Sunset Run, Roma', 41.9012, 12.4798, 16, 11, 90, 'Allenamento progressivo 7 km vista Tevere.', 'Giulia Bianchi', 96],
  [102, 2, 'Padel', 'intermediate', atOffset(5), 'Padel Arena Isola, Milano', 45.4856, 9.1892, 4, 3, 87, 'Partita doppio con cambio coppie ogni set.', 'Luca Ferrari', 92],
  [103, 3, 'Calcio', 'beginner', atOffset(8), 'Centro Barca, Bologna', 44.5072, 11.295, 14, 12, 88, 'Partitella 7vs7 serale su sintetico.', 'Matteo Serra', 89],
  [104, 4, 'Palestra', 'beginner', atOffset(-2), 'Functional District, Roma', 41.8899, 12.4922, 12, 8, 74, 'Circuito full body mattutino.', 'Claudia Rosi', 94],
  [105, 5, 'Bici', 'advanced', inDays(1, 7), 'Passetto Climb, Ancona', 43.6158, 13.5281, 10, 7, 77, 'Ripetute su salite brevi ad alta intensita.', 'Francesca Moretti', 95],
  [106, 6, 'Trekking', 'intermediate', inDays(1, 9), 'Sentiero Sibillini, Ascoli Piceno', 42.8546, 13.578, 18, 13, 85, 'Escursione 12 km ritmo medio.', 'Sara Donati', 98],
  [107, 1, 'Running', 'advanced', inDays(2, 6), 'Parco Sempione Speedwork, Milano', 45.4726, 9.1797, 12, 9, 79, 'Sessione ripetute 10x400m.', 'Davide Sala', 90],
  [108, 2, 'Padel', 'beginner', inDays(2, 19), 'PlayPadel Firenze', 43.771, 11.2486, 4, 2, 69, 'Tecnica base + tie-break finale.', 'Silvia Fontana', 97],
  [109, 3, 'Calcio', 'intermediate', inDays(3, 21), 'Campo Stella, Roma', null, null, 10, 8, 81, '5vs5 competitivo con sostituzioni libere.', 'Riccardo Lupi', 88],
  [110, 5, 'Bici', 'beginner', inDays(3, 17), 'Lungo Reno, Bologna', 44.5037, 11.3218, 12, 5, 66, 'Pedalata social 25 km ritmo easy.', 'Valerio Conti', 91],
  [111, 6, 'Trekking', 'beginner', inDays(4, 9), 'Sentiero dei Forti, Ancona', 43.6012, 13.5203, 18, 12, 76, 'Camminata panoramica + stretching.', 'Erika Berti', 93],
  [112, 4, 'Palestra', 'intermediate', inDays(4, 19), 'Gym Lab, Ascoli Piceno', 42.8549, 13.5733, 10, 7, 72, 'Forza + mobilita in piccoli gruppi.', 'Monica Greco', 95],
  [113, 1, 'Running', 'beginner', inDays(5, 7), 'Parco delle Cascine, Firenze', 43.7804, 11.2208, 20, 14, 84, 'Lungo progressivo 10 km.', 'Marta Bellini', 94],
  [114, 2, 'Padel', 'advanced', inDays(5, 20), 'Foro Italico Courts, Roma', 41.9339, 12.4548, 4, 4, 93, 'Match competitivo best of 3.', 'Alessandro Neri', 90],
  [115, 5, 'Bici', 'intermediate', inDays(6, 8), 'Lungomare, San Benedetto del Tronto', 42.9444, 13.8918, 14, 9, 80, 'Fondo medio 45 km.', 'Nadia Valli', 96],
  [116, 3, 'Calcio', 'beginner', inDays(6, 18), 'Campo San Donato, Bologna', 44.5175, 11.3708, 14, 10, 70, 'Partita aperta a nuovi iscritti.', 'Piero Mazza', 89],
  [117, 4, 'Palestra', 'advanced', inDays(7, 7), 'Crossfit Hub, Pescara', 42.4618, 14.2161, 12, 6, 78, 'WOD partner ad alta intensita.', 'Elisa Falco', 92],
  [118, 6, 'Trekking', 'intermediate', inDays(7, 8), 'Monte Conero Trail, Ancona', 43.5536, 13.5444, 16, 11, 88, 'Percorso misto terra + salita.', 'Tomas Guidi', 93],
  [119, 1, 'Running', 'intermediate', inDays(8, 19), 'Stadio Adriatico, Pescara', 42.4555, 14.2153, 15, 8, 73, 'Interval training serale.', 'Ivana Costa', 90],
  [120, 2, 'Padel', 'intermediate', inDays(9, 20), 'Padel Club Navile, Bologna', 44.5284, 11.3262, 4, 3, 75, 'Americana 1h30.', 'Lorenzo Galli', 91],
  [121, 5, 'Bici', 'advanced', inDays(10, 7), 'Colli Fiorentini Ride', 43.7696, 11.2558, 10, 6, 86, 'Allenamento collinare 60 km.', 'Paolo Rosi', 95],
  [122, 3, 'Calcio', 'intermediate', inDays(11, 21), 'Centro Sportivo Vigorelli, Milano', 45.4867, 9.1622, 12, 9, 82, '6vs6 con arbitro interno.', 'Stefano Meli', 88]
];

const ROUTE_SPORTS = new Set(['running', 'bici', 'trekking']);

function buildSeedRouteInfo({ sportName, city, locationName }) {
  const token = String(sportName || '').trim().toLowerCase();
  if (!ROUTE_SPORTS.has(token)) return null;

  if (token === 'running') {
    return {
      name: `Anello ${city || locationName}`,
      from_label: `Via X ${city || ''}`.trim(),
      to_label: `Via Y ${city || ''}`.trim(),
      distance_km: 8.4,
      elevation_gain_m: 70,
      map_url: ''
    };
  }

  if (token === 'bici') {
    return {
      name: `Circuito ${city || locationName}`,
      from_label: `Via X ${city || ''}`.trim(),
      to_label: `Via Y ${city || ''}`.trim(),
      distance_km: 42.5,
      elevation_gain_m: 480,
      map_url: ''
    };
  }

  return {
    name: `Sentiero ${city || locationName}`,
    from_label: `Via X ${city || ''}`.trim(),
    to_label: `Via Y ${city || ''}`.trim(),
    distance_km: 11.8,
    elevation_gain_m: 620,
    map_url: ''
  };
}

export const seededEvents = baseEvents.map((entry, index) => {
  const [
    id,
    sport_id,
    sport_name,
    level,
    event_datetime,
    location_name,
    lat,
    lng,
    max_participants,
    participants_count,
    popularity,
    description,
    organizerName,
    organizerReliability
  ] = entry;

  return {
    id,
    title: `${sport_name} Session ${index + 1}`,
    city: location_name.split(',').pop()?.trim() || 'Italia',
    sport_id,
    sport_name,
    level,
    event_datetime,
    location_name,
    lat,
    lng,
    max_participants,
    participants_count,
    popularity,
    description,
    organizer: { id: 1000 + index, name: organizerName, reliability_score: organizerReliability },
    participants_preview: ['Andrea', 'Franco', 'Elena', 'Nora'].slice(0, (participants_count % 4) + 1),
    etiquette: ['Puntualita', 'Comunicazione chiara', 'Rispetto del gruppo'],
    route_info: buildSeedRouteInfo({
      sportName: sport_name,
      city: location_name.split(',').pop()?.trim() || 'Italia',
      locationName: location_name
    })
  };
});

export const localUserSeed = {
  id: 'me',
  name: 'Tu',
  bio: '',
  avatar_url: '',
  goal: 'social',
  attended: 0,
  no_show: 0,
  cancelled: 0,
  reliability: 0
};
