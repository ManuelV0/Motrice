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
  { id: 'femorali', label: 'Femorali' },
  { id: 'polpacci', label: 'Polpacci' },
  { id: 'glutei', label: 'Glutei' },
  { id: 'core', label: 'Core' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobilita', label: 'Mobilità' }
];

export const PERSONAL_EXERCISE_LIBRARY = [
  { id: 'bench-press', name: 'Panca piana con bilanciere', shortName: 'Panca piana', category: 'petto', equipment: 'Bilanciere', aliases: ['bench press', 'panca bilanciere'], sets: 3, reps: '8-10', weight: 80, rir: 2, recovery: 120 },
  { id: 'incline-dumbbell-press', name: 'Panca inclinata manubri', shortName: 'Panca inclinata', category: 'petto', equipment: 'Manubri', aliases: ['incline press', 'panca alta'], sets: 3, reps: '10', weight: 32, rir: 2, recovery: 90 },
  { id: 'chest-press', name: 'Chest Press', category: 'petto', equipment: 'Macchina', sets: 3, reps: '12', weight: 60, rir: 1, recovery: 90 },
  { id: 'cable-fly', name: 'Croci ai cavi', category: 'petto', equipment: 'Cavi', sets: 3, reps: '12', weight: 15, rir: 1, recovery: 60 },
  { id: 'incline-barbell-press', name: 'Panca inclinata con bilanciere', shortName: 'Panca inclinata bilanciere', category: 'petto', equipment: 'Bilanciere', aliases: ['incline bench press', 'panca alta bilanciere'], sets: 4, reps: '8-10', weight: 60, rir: 2, recovery: 120 },
  { id: 'dumbbell-bench-press', name: 'Panca piana con manubri', shortName: 'Panca manubri', category: 'petto', equipment: 'Manubri', aliases: ['dumbbell bench press'], sets: 3, reps: '8-12', weight: 28, rir: 2, recovery: 90 },
  { id: 'pec-deck', name: 'Pec deck', shortName: 'Pectoral machine', category: 'petto', equipment: 'Macchina', aliases: ['butterfly', 'pectoral machine'], sets: 3, reps: '12-15', weight: 45, rir: 1, recovery: 60 },
  { id: 'push-up', name: 'Piegamenti sulle braccia', shortName: 'Piegamenti', category: 'petto', equipment: 'Corpo libero', aliases: ['push up', 'push-up', 'flessioni'], sets: 3, reps: 'Max', weight: 0, rir: 2, recovery: 60 },
  { id: 'dumbbell-fly', name: 'Croci con manubri', category: 'petto', equipment: 'Manubri', aliases: ['dumbbell fly', 'aperture manubri'], sets: 3, reps: '12', weight: 12, rir: 2, recovery: 60 },
  { id: 'lat-machine', name: 'Lat machine', category: 'schiena', equipment: 'Macchina', sets: 4, reps: '8-10', weight: 55, rir: 2, recovery: 90 },
  { id: 'barbell-row', name: 'Rematore con bilanciere', category: 'schiena', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 60, rir: 2, recovery: 120 },
  { id: 'seated-row', name: 'Pulley basso', category: 'schiena', equipment: 'Cavi', sets: 3, reps: '10-12', weight: 45, rir: 1, recovery: 90 },
  { id: 'pull-up', name: 'Trazioni', category: 'schiena', equipment: 'Corpo libero', sets: 4, reps: 'Max', weight: 0, rir: 1, recovery: 120 },
  { id: 'deadlift', name: 'Stacco da terra', category: 'schiena', equipment: 'Bilanciere', aliases: ['deadlift', 'stacco convenzionale'], sets: 4, reps: '5', weight: 100, rir: 2, recovery: 180 },
  { id: 'one-arm-dumbbell-row', name: 'Rematore con manubrio', shortName: 'Rematore manubrio', category: 'schiena', equipment: 'Manubri', aliases: ['one arm row', 'rematore unilaterale'], sets: 3, reps: '10+10', weight: 28, rir: 2, recovery: 90 },
  { id: 't-bar-row', name: 'T-bar row', shortName: 'Rematore T-bar', category: 'schiena', equipment: 'Bilanciere', aliases: ['rematore t bar'], sets: 4, reps: '8-10', weight: 50, rir: 2, recovery: 120 },
  { id: 'close-grip-lat-pulldown', name: 'Lat machine presa stretta', shortName: 'Lat presa stretta', category: 'schiena', equipment: 'Macchina', aliases: ['close grip pulldown'], sets: 3, reps: '10-12', weight: 50, rir: 2, recovery: 90 },
  { id: 'straight-arm-pulldown', name: 'Pulldown a braccia tese', shortName: 'Pulldown braccia tese', category: 'schiena', equipment: 'Cavi', aliases: ['straight arm pulldown', 'pull over cavo'], sets: 3, reps: '12-15', weight: 25, rir: 1, recovery: 60 },
  { id: 'inverted-row', name: 'Rematore inverso', category: 'schiena', equipment: 'Corpo libero', aliases: ['inverted row', 'australian pull up'], sets: 3, reps: 'Max', weight: 0, rir: 2, recovery: 90 },
  { id: 'military-press', name: 'Military press', category: 'spalle', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 40, rir: 2, recovery: 120 },
  { id: 'lateral-raise', name: 'Alzate laterali', category: 'spalle', equipment: 'Manubri', sets: 3, reps: '12-15', weight: 10, rir: 1, recovery: 60 },
  { id: 'face-pull', name: 'Face pull', category: 'spalle', equipment: 'Cavi', sets: 3, reps: '15', weight: 20, rir: 2, recovery: 60 },
  { id: 'arnold-press', name: 'Arnold press', category: 'spalle', equipment: 'Manubri', sets: 3, reps: '10', weight: 18, rir: 2, recovery: 90 },
  { id: 'dumbbell-shoulder-press', name: 'Shoulder press con manubri', shortName: 'Shoulder press manubri', category: 'spalle', equipment: 'Manubri', aliases: ['spinte manubri spalle'], sets: 4, reps: '8-10', weight: 22, rir: 2, recovery: 90 },
  { id: 'machine-shoulder-press', name: 'Shoulder press alla macchina', shortName: 'Shoulder press macchina', category: 'spalle', equipment: 'Macchina', aliases: ['press spalle macchina'], sets: 3, reps: '10-12', weight: 45, rir: 2, recovery: 90 },
  { id: 'front-raise', name: 'Alzate frontali', category: 'spalle', equipment: 'Manubri', aliases: ['front raise'], sets: 3, reps: '12', weight: 8, rir: 1, recovery: 60 },
  { id: 'reverse-fly', name: 'Croci inverse con manubri', shortName: 'Croci inverse', category: 'spalle', equipment: 'Manubri', aliases: ['reverse fly', 'deltoidi posteriori'], sets: 3, reps: '12-15', weight: 8, rir: 1, recovery: 60 },
  { id: 'cable-lateral-raise', name: 'Alzate laterali al cavo', shortName: 'Laterali al cavo', category: 'spalle', equipment: 'Cavi', aliases: ['cable lateral raise'], sets: 3, reps: '12+12', weight: 7.5, rir: 1, recovery: 60 },
  { id: 'barbell-curl', name: 'Curl con bilanciere', category: 'bicipiti', equipment: 'Bilanciere', sets: 3, reps: '10', weight: 25, rir: 2, recovery: 75 },
  { id: 'dumbbell-curl', name: 'Curl alternato', category: 'bicipiti', equipment: 'Manubri', sets: 3, reps: '12', weight: 12, rir: 1, recovery: 60 },
  { id: 'hammer-curl', name: 'Hammer curl', category: 'bicipiti', equipment: 'Manubri', sets: 3, reps: '10-12', weight: 14, rir: 1, recovery: 60 },
  { id: 'preacher-curl', name: 'Curl alla panca Scott', shortName: 'Panca Scott', category: 'bicipiti', equipment: 'Bilanciere', aliases: ['preacher curl', 'curl scott'], sets: 3, reps: '10-12', weight: 22, rir: 2, recovery: 75 },
  { id: 'cable-curl', name: 'Curl ai cavi', category: 'bicipiti', equipment: 'Cavi', aliases: ['cable curl'], sets: 3, reps: '12-15', weight: 20, rir: 1, recovery: 60 },
  { id: 'incline-dumbbell-curl', name: 'Curl su panca inclinata', shortName: 'Curl inclinato', category: 'bicipiti', equipment: 'Manubri', aliases: ['incline curl'], sets: 3, reps: '10-12', weight: 10, rir: 2, recovery: 60 },
  { id: 'reverse-curl', name: 'Curl inverso', category: 'bicipiti', equipment: 'Bilanciere', aliases: ['reverse curl', 'curl presa prona'], sets: 3, reps: '12', weight: 18, rir: 2, recovery: 60 },
  { id: 'pushdown', name: 'Pushdown', category: 'tricipiti', equipment: 'Cavi', sets: 3, reps: '12', weight: 25, rir: 1, recovery: 60 },
  { id: 'french-press', name: 'French Press', category: 'tricipiti', equipment: 'Bilanciere', sets: 3, reps: '10', weight: 22, rir: 2, recovery: 75 },
  { id: 'dips', name: 'Dips alle parallele', category: 'tricipiti', equipment: 'Corpo libero', sets: 3, reps: 'Max', weight: 0, rir: 1, recovery: 90 },
  { id: 'overhead-cable-extension', name: 'Estensioni sopra la testa al cavo', shortName: 'Estensioni overhead', category: 'tricipiti', equipment: 'Cavi', aliases: ['overhead cable extension'], sets: 3, reps: '12-15', weight: 20, rir: 1, recovery: 60 },
  { id: 'skull-crusher', name: 'Skull crusher', shortName: 'French press sdraiato', category: 'tricipiti', equipment: 'Bilanciere', aliases: ['estensioni tricipiti sdraiato'], sets: 3, reps: '10-12', weight: 22, rir: 2, recovery: 75 },
  { id: 'close-grip-bench-press', name: 'Panca presa stretta', category: 'tricipiti', equipment: 'Bilanciere', aliases: ['close grip bench press', 'panca stretta'], sets: 4, reps: '8-10', weight: 60, rir: 2, recovery: 120 },
  { id: 'triceps-kickback', name: 'Kickback tricipiti', shortName: 'Kickback', category: 'tricipiti', equipment: 'Manubri', aliases: ['triceps kickback'], sets: 3, reps: '12+12', weight: 8, rir: 1, recovery: 60 },
  { id: 'squat', name: 'Squat', category: 'gambe', equipment: 'Bilanciere', sets: 4, reps: '6-8', weight: 90, rir: 2, recovery: 150 },
  { id: 'leg-press', name: 'Leg press', category: 'gambe', equipment: 'Macchina', sets: 4, reps: '10', weight: 140, rir: 2, recovery: 120 },
  { id: 'walking-lunge', name: 'Affondi camminati', category: 'gambe', equipment: 'Manubri', sets: 3, reps: '10+10', weight: 16, rir: 2, recovery: 90 },
  { id: 'leg-extension', name: 'Leg extension', category: 'gambe', equipment: 'Macchina', sets: 3, reps: '12-15', weight: 45, rir: 1, recovery: 75 },
  { id: 'front-squat', name: 'Front squat', shortName: 'Squat frontale', category: 'gambe', equipment: 'Bilanciere', aliases: ['squat frontale'], sets: 4, reps: '6-8', weight: 65, rir: 2, recovery: 150 },
  { id: 'hack-squat', name: 'Hack squat', category: 'gambe', equipment: 'Macchina', aliases: ['pressa hack'], sets: 4, reps: '8-12', weight: 80, rir: 2, recovery: 120 },
  { id: 'pendulum-squat', name: 'Pendulum squat', shortName: 'Squat pendolare', category: 'gambe', equipment: 'Macchina', aliases: ['squat pendolo', 'squat pendolare', 'pendulum'], sets: 4, reps: '8-12', weight: 60, rir: 2, recovery: 120 },
  { id: 'goblet-squat', name: 'Goblet squat', category: 'gambe', equipment: 'Manubri', aliases: ['squat a calice'], sets: 3, reps: '12', weight: 24, rir: 2, recovery: 90 },
  { id: 'bulgarian-split-squat', name: 'Squat bulgaro', category: 'gambe', equipment: 'Manubri', aliases: ['bulgarian split squat', 'affondo bulgaro'], sets: 3, reps: '10+10', weight: 14, rir: 2, recovery: 90 },
  { id: 'reverse-lunge', name: 'Affondi indietro', category: 'gambe', equipment: 'Manubri', aliases: ['reverse lunge', 'affondi inversi'], sets: 3, reps: '10+10', weight: 14, rir: 2, recovery: 90 },
  { id: 'step-up', name: 'Step up', category: 'gambe', equipment: 'Manubri', aliases: ['salita su box'], sets: 3, reps: '10+10', weight: 12, rir: 2, recovery: 75 },
  { id: 'lying-leg-curl', name: 'Leg curl sdraiato', category: 'femorali', equipment: 'Macchina', aliases: ['lying leg curl', 'curl femorali'], sets: 3, reps: '10-12', weight: 35, rir: 1, recovery: 75 },
  { id: 'seated-leg-curl', name: 'Leg curl seduto', category: 'femorali', equipment: 'Macchina', aliases: ['seated leg curl'], sets: 3, reps: '12-15', weight: 35, rir: 1, recovery: 75 },
  { id: 'nordic-curl', name: 'Nordic curl', category: 'femorali', equipment: 'Corpo libero', aliases: ['nordic hamstring curl'], sets: 3, reps: '6-8', weight: 0, rir: 2, recovery: 120 },
  { id: 'good-morning', name: 'Good morning', category: 'femorali', equipment: 'Bilanciere', aliases: ['flessione busto bilanciere'], sets: 3, reps: '10', weight: 35, rir: 3, recovery: 90 },
  { id: 'standing-calf-raise', name: 'Calf raise in piedi', shortName: 'Calf in piedi', category: 'polpacci', equipment: 'Macchina', aliases: ['standing calf raise', 'polpacci in piedi'], sets: 4, reps: '12-15', weight: 60, rir: 1, recovery: 60 },
  { id: 'seated-calf-raise', name: 'Calf raise seduto', shortName: 'Calf seduto', category: 'polpacci', equipment: 'Macchina', aliases: ['seated calf raise', 'polpacci seduto'], sets: 4, reps: '15-20', weight: 40, rir: 1, recovery: 60 },
  { id: 'calf-press', name: 'Calf alla leg press', shortName: 'Calf pressa', category: 'polpacci', equipment: 'Macchina', aliases: ['calf press', 'polpacci pressa'], sets: 4, reps: '15-20', weight: 90, rir: 1, recovery: 60 },
  { id: 'hip-thrust', name: 'Hip thrust', category: 'glutei', equipment: 'Bilanciere', sets: 4, reps: '8-10', weight: 90, rir: 2, recovery: 120 },
  { id: 'romanian-deadlift', name: 'Stacco rumeno', category: 'glutei', equipment: 'Bilanciere', sets: 4, reps: '8', weight: 70, rir: 2, recovery: 120 },
  { id: 'cable-abduction', name: 'Abduzioni al cavo', category: 'glutei', equipment: 'Cavi', sets: 3, reps: '15', weight: 12, rir: 1, recovery: 60 },
  { id: 'glute-bridge', name: 'Glute bridge', shortName: 'Ponte glutei', category: 'glutei', equipment: 'Corpo libero', aliases: ['ponte per glutei'], sets: 3, reps: '15-20', weight: 0, rir: 2, recovery: 60 },
  { id: 'cable-kickback', name: 'Slanci posteriori al cavo', shortName: 'Kickback al cavo', category: 'glutei', equipment: 'Cavi', aliases: ['cable kickback', 'calci glutei'], sets: 3, reps: '12+12', weight: 12, rir: 1, recovery: 60 },
  { id: 'abductor-machine', name: 'Abductor machine', shortName: 'Abduzioni alla macchina', category: 'glutei', equipment: 'Macchina', aliases: ['macchina abduttori'], sets: 3, reps: '15-20', weight: 45, rir: 1, recovery: 60 },
  { id: 'sumo-deadlift', name: 'Stacco sumo', category: 'glutei', equipment: 'Bilanciere', aliases: ['sumo deadlift'], sets: 4, reps: '6-8', weight: 90, rir: 2, recovery: 150 },
  { id: 'plank', name: 'Plank', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '45 sec', weight: 0, rir: 1, recovery: 45 },
  { id: 'crunch', name: 'Crunch', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '15-20', weight: 0, rir: 1, recovery: 45 },
  { id: 'dead-bug', name: 'Dead bug', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '10+10', weight: 0, rir: 2, recovery: 45 },
  { id: 'russian-twist', name: 'Russian twist', category: 'core', equipment: 'Corpo libero', sets: 3, reps: '20', weight: 0, rir: 1, recovery: 45 },
  { id: 'hanging-leg-raise', name: 'Sollevamento gambe alla sbarra', shortName: 'Leg raise alla sbarra', category: 'core', equipment: 'Corpo libero', aliases: ['hanging leg raise', 'addominali alla sbarra'], sets: 3, reps: '10-15', weight: 0, rir: 2, recovery: 60 },
  { id: 'cable-crunch', name: 'Crunch al cavo', category: 'core', equipment: 'Cavi', aliases: ['cable crunch'], sets: 3, reps: '12-15', weight: 25, rir: 1, recovery: 60 },
  { id: 'ab-wheel', name: 'Ab wheel', shortName: 'Rollout addominale', category: 'core', equipment: 'Corpo libero', aliases: ['ruota addominali', 'ab rollout'], sets: 3, reps: '8-12', weight: 0, rir: 2, recovery: 60 },
  { id: 'side-plank', name: 'Plank laterale', category: 'core', equipment: 'Corpo libero', aliases: ['side plank'], sets: 3, reps: '30 sec + 30 sec', weight: 0, rir: 2, recovery: 45 },
  { id: 'pallof-press', name: 'Pallof press', category: 'core', equipment: 'Cavi', aliases: ['anti rotazione cavo'], sets: 3, reps: '10+10', weight: 12, rir: 2, recovery: 60 },
  { id: 'treadmill', name: 'Tapis roulant', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '20 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'bike', name: 'Bike', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '25 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'rower', name: 'Vogatore', category: 'cardio', equipment: 'Macchina', sets: 5, reps: '500 m', weight: 0, rir: 2, recovery: 90 },
  { id: 'elliptical', name: 'Ellittica', category: 'cardio', equipment: 'Macchina', sets: 1, reps: '20 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'stair-climber', name: 'Stair climber', shortName: 'Scale', category: 'cardio', equipment: 'Macchina', aliases: ['stepmill', 'macchina scale'], sets: 1, reps: '15 min', weight: 0, rir: 3, recovery: 0 },
  { id: 'jump-rope', name: 'Salto con la corda', shortName: 'Corda', category: 'cardio', equipment: 'Corpo libero', aliases: ['jump rope', 'corda'], sets: 5, reps: '60 sec', weight: 0, rir: 2, recovery: 45 },
  { id: 'cat-cow', name: 'Mobilità cat-cow', shortName: 'Cat-cow', category: 'mobilita', equipment: 'Corpo libero', aliases: ['gatto mucca', 'mobilita colonna'], sets: 2, reps: '10', weight: 0, rir: 4, recovery: 30 },
  { id: 'hip-flexor-stretch', name: 'Mobilità flessori dell’anca', shortName: 'Flessori anca', category: 'mobilita', equipment: 'Corpo libero', aliases: ['hip flexor stretch', 'stretching anca'], sets: 2, reps: '30 sec + 30 sec', weight: 0, rir: 4, recovery: 30 }
];

export const EXERCISE_EQUIPMENT_FILTERS = [
  'Bilanciere',
  'Manubri',
  'Macchina',
  'Cavi',
  'Corpo libero'
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

export function getExerciseSearchText(exercise) {
  return [
    exercise?.name,
    exercise?.shortName,
    exercise?.equipment,
    getCategoryLabel(exercise?.category),
    ...(Array.isArray(exercise?.aliases) ? exercise.aliases : [])
  ].filter(Boolean).join(' ');
}

function normalizedExerciseKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getLatestExercisePrescription(exercise, history = []) {
  const matchingKeys = new Set([
    exercise?.id,
    exercise?.name,
    exercise?.shortName,
    ...(Array.isArray(exercise?.aliases) ? exercise.aliases : [])
  ].map(normalizedExerciseKey).filter(Boolean));

  const latest = (Array.isArray(history) ? history : [])
    .filter((entry) => {
      const entryKeys = [entry?.exerciseKey, entry?.exerciseName, entry?.exerciseId]
        .map(normalizedExerciseKey)
        .filter(Boolean);
      return entryKeys.some((key) => matchingKeys.has(key));
    })
    .sort((left, right) => Date.parse(right?.completedAt || 0) - Date.parse(left?.completedAt || 0))[0];

  if (!latest) return null;
  const weight = Number(latest.weightKg);
  const reps = Number(latest.reps);
  const rir = Number(latest.rir);
  return {
    weight: Number.isFinite(weight) ? Math.max(0, weight) : Math.max(0, Number(exercise?.weight) || 0),
    reps: Number.isFinite(reps) && reps > 0 ? String(reps) : String(exercise?.reps || '10'),
    rir: Number.isFinite(rir) ? Math.max(0, Math.min(5, rir)) : Math.max(0, Number(exercise?.rir) || 0),
    completedAt: latest.completedAt || null
  };
}
