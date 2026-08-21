export const WORKOUT_SPORTS = [
  {
    id: 'palestra',
    label: 'Palestra',
    emoji: '🏋️',
    types: ['Bodybuilding', 'Forza', 'Functional', 'Mobilità']
  },
  {
    id: 'running',
    label: 'Running',
    emoji: '🏃',
    types: ['Corsa facile', 'Ripetute', 'Lungo', 'Trail']
  },
  {
    id: 'calcio',
    label: 'Calcio',
    emoji: '⚽',
    types: ['Tecnica', 'Atletica', 'Tattica', 'Partita']
  },
  {
    id: 'padel',
    label: 'Padel',
    emoji: '🎾',
    types: ['Tecnica', 'Partita', 'Condizionamento']
  },
  {
    id: 'ciclismo',
    label: 'Ciclismo',
    emoji: '🚴',
    types: ['Endurance', 'Intervalli', 'Recupero']
  }
];

export const WORKOUT_DURATIONS = [30, 45, 60, 90];

export const WORKOUT_LEVELS = [
  { id: 'base', label: 'Base' },
  { id: 'mid', label: 'Mid' },
  { id: 'pro', label: 'Pro' }
];

export const WORKOUT_EQUIPMENT = [
  { id: 'bilanciere', label: 'Bilanciere' },
  { id: 'manubri', label: 'Manubri' },
  { id: 'macchine', label: 'Macchine' },
  { id: 'cavi', label: 'Cavi' },
  { id: 'corpo-libero', label: 'Corpo libero' }
];

export const EXERCISE_CATEGORIES = [
  { id: 'petto', label: 'Petto' },
  { id: 'schiena', label: 'Schiena' },
  { id: 'spalle', label: 'Spalle' },
  { id: 'bicipiti', label: 'Bicipiti' },
  { id: 'tricipiti', label: 'Tricipiti' },
  { id: 'gambe', label: 'Gambe' },
  { id: 'glutei', label: 'Glutei' },
  { id: 'core', label: 'Core' },
  { id: 'cardio', label: 'Cardio' }
];

export const PERSONAL_EXERCISE_LIBRARY = [
  { id: 'bench-press', name: 'Panca piana con bilanciere', shortName: 'Panca piana', category: 'petto', equipment: 'Bilanciere', sets: 3, reps: '8-10', weight: 80, rir: 2, recovery: 120 },
  { id: 'incline-dumbbell-press', name: 'Panca inclinata manubri', shortName: 'Panca inclinata', category: 'petto', equipment: 'Manubri', sets: 3, reps: '10', weight: 32, rir: 2, recovery: 90 },
  { id: 'chest-press', name: 'Chest Press', category: 'petto', equipment: 'Macchina', sets: 3, reps: '12', weight: 60, rir: 1, recovery: 90 },
  { id: 'cable-fly', name: 'Croci ai cavi', category: 'petto', equipment: 'Cavi', sets: 3, reps: '12', weight: 15, rir: 1, recovery: 60 },
  { id: 'lat-machine', name: 'Lat machine', category: 'schiena', equipment: 'Macchina', sets: 4, reps: '8-10', weight: 55, rir: 2, recovery: 90 },
  { id: 'barbell-row', name: 'Rematore con bilanciere', category: 'schiena', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 60, rir: 2, recovery: 120 },
  { id: 'seated-row', name: 'Pulley basso', category: 'schiena', equipment: 'Cavi', sets: 3, reps: '10-12', weight: 45, rir: 1, recovery: 90 },
  { id: 'pull-up', name: 'Trazioni', category: 'schiena', equipment: 'Corpo libero', sets: 4, reps: 'Max', weight: 0, rir: 1, recovery: 120 },
  { id: 'military-press', name: 'Military press', category: 'spalle', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 40, rir: 2, recovery: 120 },
  { id: 'lateral-raise', name: 'Alzate laterali', category: 'spalle', equipment: 'Manubri', sets: 3, reps: '12-15', weight: 10, rir: 1, recovery: 60 },
  { id: 'face-pull', name: 'Face pull', category: 'spalle', equipment: 'Cavi', sets: 3, reps: '15', weight: 20, rir: 2, recovery: 60 },
  { id: 'arnold-press', name: 'Arnold press', category: 'spalle', equipment: 'Manubri', sets: 3, reps: '10', weight: 18, rir: 2, recovery: 90 },
  { id: 'barbell-curl', name: 'Curl con bilanciere', category: 'bicipiti', equipment: 'Bilanciere', sets: 3, reps: '10', weight: 25, rir: 2, recovery: 75 },
  { id: 'dumbbell-curl', name: 'Curl alternato', category: 'bicipiti', equipment: 'Manubri', sets: 3, reps: '12', weight: 12, rir: 1, recovery: 60 },
  { id: 'hammer-curl', name: 'Hammer curl', category: 'bicipiti', equipment: 'Manubri', sets: 3, reps: '10-12', weight: 14, rir: 1, recovery: 60 },
  { id: 'pushdown', name: 'Pushdown', category: 'tricipiti', equipment: 'Cavi', sets: 3, reps: '12', weight: 25, rir: 1, recovery: 60 },
  { id: 'french-press', name: 'French Press', category: 'tricipiti', equipment: 'Bilanciere', sets: 3, reps: '10', weight: 22, rir: 2, recovery: 75 },
  { id: 'dips', name: 'Dips alle parallele', category: 'tricipiti', equipment: 'Corpo libero', sets: 3, reps: 'Max', weight: 0, rir: 1, recovery: 90 },
  { id: 'squat', name: 'Squat', category: 'gambe', equipment: 'Bilanciere', sets: 4, reps: '6-8', weight: 90, rir: 2, recovery: 150 },
  { id: 'leg-press', name: 'Leg press', category: 'gambe', equipment: 'Macchina', sets: 4, reps: '10', weight: 140, rir: 2, recovery: 120 },
  { id: 'walking-lunge', name: 'Affondi camminati', category: 'gambe', equipment: 'Manubri', sets: 3, reps: '10+10', weight: 16, rir: 2, recovery: 90 },
  { id: 'leg-extension', name: 'Leg extension', category: 'gambe', equipment: 'Macchina', sets: 3, reps: '12-15', weight: 45, rir: 1, recovery: 75 },
  { id: 'hip-thrust', name: 'Hip thrust', category: 'glutei', equipment: 'Bilanciere', sets: 4, reps: '8-10', weight: 90, rir: 2, recovery: 120 },
  { id: 'romanian-deadlift', name: 'Stacco rumeno', category: 'glutei', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 70, rir: 2, recovery: 120 },
  { id: 'cable-abduction', name: 'Abduzioni al cavo', category: 'glutei', equipment: 'Cavi', sets: 3, reps: '15', weight: 12, rir: 1, recovery: 60 },
  { id: 'plank', name: 'Plank', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '45 sec', weight: 0, rir: 1, recovery: 45 },
  { id: 'crunch', name: 'Crunch', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '15-20', weight: 0, rir: 1, recovery: 45 },
  { id: 'dead-bug', name: 'Dead bug', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '10+10', weight: 0, rir: 2, recovery: 45 },
  { id: 'russian-twist', name: 'Russian twist', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '20', weight: 0, rir: 1, recovery: 45 },
  { id: 'treadmill', name: 'Tapis roulant', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '20 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'bike', name: 'Bike', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '25 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'rower', name: 'Vogatore', category: 'cardio', equipment: 'Macchina', sets: 5, reps: '500 m', weight: 0, rir: 2, recovery: 90 },
  { id: 'elliptical', name: 'Ellittica', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '20 min', weight: 0, rir: 3, recovery: 0 }
];

export const STARTER_EXERCISE_IDS = [
  'bench-press',
  'incline-dumbbell-press',
  'chest-press',
  'cable-fly'
];

export function getSportById(sportId) {
  return WORKOUT_SPORTS.find((sport) => sport.id === sportId) || WORKOUT_SPORTS[0];
}

export function getCategoryLabel(categoryId) {
  return EXERCISE_CATEGORIES.find((category) => category.id === categoryId)?.label || categoryId;
}
