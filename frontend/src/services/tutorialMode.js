import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const TUTORIAL_KEY = 'motrice_tutorial_mode_v1';

const ROLE_CATALOG = [
  {
    id: 'atleta',
    label: 'Atleta',
    description: 'Scopri eventi, iscriviti e gestisci agenda personale.'
  },
  {
    id: 'organizzatore',
    label: 'Organizzatore',
    description: 'Crea sessioni, pubblica dettagli e monitora partecipazioni.'
  },
  {
    id: 'coach',
    label: 'Coach',
    description: 'Candidati, pubblica profilo coach e gestisci piani allenamento.'
  },
  {
    id: 'partner',
    label: 'Partner (Associazioni/Palestre)',
    description: 'Percorso dedicato a strutture convenzionate: candidatura, profilo, promo e gestione operativa.'
  }
];

const PERSPECTIVE_CATALOG = {
  atleta: [
    { id: 'explore', label: 'Esplora Eventi', description: 'Come trovare e scegliere le sessioni migliori.' },
    { id: 'map', label: 'Mappa Live', description: 'Come usare la geolocalizzazione per scegliere meglio.' },
    { id: 'agenda', label: 'Agenda Personale', description: 'Come pianificare allenamenti e continuita.' },
    { id: 'coach', label: 'Trova Coach', description: 'Come valutare coach e decidere quando contattarli.' },
    { id: 'convenzioni', label: 'Convenzioni', description: 'Come sfruttare partner e vantaggi disponibili.' },
    { id: 'pricing', label: 'Salvadanaio/Pricing', description: 'Come capire limiti piano e opzioni di sblocco.' },
    { id: 'notifications', label: 'Notifiche', description: 'Come restare aggiornato su eventi e cambiamenti.' },
    { id: 'account', label: 'Account', description: 'Come configurare profilo e preferenze personali.' },
    { id: 'faq', label: 'FAQ', description: 'Come risolvere dubbi rapidi senza blocchi.' }
  ],
  organizzatore: [
    { id: 'create', label: 'Crea Sessione', description: 'Come creare sessioni complete e comprensibili.' },
    { id: 'explore', label: 'Vista Evento', description: 'Come controllare resa delle card in Esplora.' },
    { id: 'agenda', label: 'Agenda', description: 'Come distribuire calendario e carico sessioni.' },
    { id: 'notifications', label: 'Notifiche', description: 'Come gestire richieste e aggiornamenti operativi.' },
    { id: 'pricing', label: 'Pricing', description: 'Come valutare limiti piano e upgrade.' },
    { id: 'account', label: 'Account', description: 'Come migliorare affidabilita profilo organizzatore.' },
    { id: 'faq', label: 'FAQ', description: 'Come allineare policy e risposte standard.' }
  ],
  coach: [
    { id: 'become-coach', label: 'Diventa Coach', description: 'Come candidarti e cosa aspettarti in fase di attesa.' },
    { id: 'coach', label: 'Profilo Coach', description: 'Come presentarti e posizionarti nel marketplace.' },
    { id: 'dashboard', label: 'Dashboard Coach', description: 'Come configurare offerta e flussi operativi.' },
    { id: 'plans', label: 'Le Mie Schede', description: 'Come costruire e gestire i piani dei clienti.' },
    { id: 'notifications', label: 'Notifiche', description: 'Come gestire richieste e follow-up clienti.' },
    { id: 'account', label: 'Account', description: 'Come allineare bio, immagine e disponibilita.' },
    { id: 'faq', label: 'FAQ', description: 'Come rispondere a casi comuni senza blocchi.' },
    { id: 'pricing', label: 'Pricing', description: 'Come capire limiti/potenziale del piano attivo.' }
  ],
  partner: [
    { id: 'convenzioni', label: 'Candidatura Convenzioni', description: 'Come inviare candidatura struttura e monitorare lo stato.' },
    { id: 'pricing', label: 'Piano Promo', description: 'Come scegliere piano Free/Premium per volume promozioni.' },
    { id: 'account', label: 'Profilo Struttura', description: 'Come mantenere dati associazione/palestra aggiornati e verificabili.' },
    { id: 'faq', label: 'Tempi e Regole', description: 'Come gestire attese, revisione e casi limite della convenzione.' }
  ]
};

const GOAL_CATALOG = {
  atleta: [
    {
      id: 'partecipa_evento',
      label: 'Partecipa al primo evento',
      description: 'Trova una sessione, valuta distanza reale e conferma partecipazione.',
      perspective: 'explore',
      estimatedMinutes: 8
    },
    {
      id: 'profilo_pronto',
      label: 'Completa il profilo atleta',
      description: 'Imposta bio e dati essenziali per usare al meglio la piattaforma.',
      perspective: 'account',
      estimatedMinutes: 5
    }
  ],
  organizzatore: [
    {
      id: 'crea_evento',
      label: 'Crea la tua prima sessione',
      description: 'Pubblica un evento completo e verifica resa in Esplora.',
      perspective: 'create',
      estimatedMinutes: 10
    },
    {
      id: 'profilo_organizzatore',
      label: 'Rendi credibile il profilo',
      description: 'Aggiorna account e informazioni base per aumentare fiducia.',
      perspective: 'account',
      estimatedMinutes: 6
    }
  ],
  coach: [
    {
      id: 'diventa_coach',
      label: 'Attiva percorso coach',
      description: 'Completa candidatura e imposta le aree operative principali.',
      perspective: 'become-coach',
      estimatedMinutes: 12
    },
    {
      id: 'profilo_coach',
      label: 'Ottimizza profilo coach',
      description: 'Bio, immagine e posizionamento per essere trovato meglio.',
      perspective: 'account',
      estimatedMinutes: 7
    }
  ],
  partner: [
    {
      id: 'attiva_convenzione',
      label: 'Invia candidatura struttura',
      description: 'Compila la richiesta convenzione e monitora lo stato.',
      perspective: 'convenzioni',
      estimatedMinutes: 8
    },
    {
      id: 'profilo_partner',
      label: 'Completa profilo struttura',
      description: 'Aggiorna contatti, descrizione e media per revisione rapida.',
      perspective: 'account',
      estimatedMinutes: 6
    }
  ]
};

const SITE_FUNCTIONS = [
  {
    id: 'explore',
    title: 'Esplora eventi',
    description: 'Trova sessioni per sport, data e livello. Entrata principale per utenti sportivi.',
    to: '/explore',
    audience: ['atleta', 'organizzatore']
  },
  {
    id: 'map',
    title: 'Mappa live',
    description: 'Vista geolocalizzata delle attivita in zona con filtro rapido per distanza.',
    to: '/map',
    audience: ['atleta', 'organizzatore']
  },
  {
    id: 'agenda',
    title: 'Agenda personale',
    description: 'Raccolta degli eventi salvati e pianificazione settimanale/mensile.',
    to: '/agenda',
    audience: ['atleta', 'organizzatore', 'coach']
  },
  {
    id: 'create',
    title: 'Crea sessione',
    description: 'Pubblicazione eventi con titolo, orario, posizione, posti e dettagli operativi.',
    to: '/create',
    audience: ['organizzatore']
  },
  {
    id: 'become-coach',
    title: 'Diventa coach',
    description: 'Onboarding candidatura coach con stato e passaggi dedicati.',
    to: '/become-coach',
    audience: ['coach']
  },
  {
    id: 'coach',
    title: 'Area coach',
    description: 'Ricerca coach, candidatura e dashboard dedicata ai piani di allenamento.',
    to: '/coach',
    audience: ['coach', 'atleta']
  },
  {
    id: 'convenzioni',
    title: 'Convenzioni partner',
    description: 'Gestione buoni convenzione, vantaggi commerciali e accordi partner.',
    to: '/convenzioni',
    audience: ['partner', 'atleta']
  },
  {
    id: 'pricing',
    title: 'Piani e salvadanaio',
    description: 'Confronto piani Free/Premium e stato dei limiti funzionali utente.',
    to: '/pricing',
    audience: ['atleta', 'organizzatore', 'coach', 'partner']
  },
  {
    id: 'account',
    title: 'Account e preferenze',
    description: 'Impostazioni profilo, bio, immagine, tema e stato sottoscrizione.',
    to: '/account',
    audience: ['atleta', 'organizzatore', 'coach', 'partner']
  },
  {
    id: 'notifications',
    title: 'Notifiche',
    description: 'Centro notifiche per aggiornamenti operativi e reminder.',
    to: '/notifications',
    audience: ['atleta', 'organizzatore', 'coach']
  },
  {
    id: 'faq',
    title: 'FAQ operativa',
    description: 'Risposte rapide per dubbi frequenti e casi limite.',
    to: '/faq',
    audience: ['atleta', 'organizzatore', 'coach', 'partner']
  },
  {
    id: 'coach-dashboard',
    title: 'Dashboard coach',
    description: 'Pannello operativo per gestione offerta coach.',
    to: '/dashboard/coach',
    audience: ['coach']
  },
  {
    id: 'coach-plans',
    title: 'Le mie schede',
    description: 'Area dedicata alla gestione schede e piani coaching.',
    to: '/dashboard/plans',
    audience: ['coach']
  }
];

const TUTORIAL_TRACKS = {
  atleta: {
    full: [
      { id: 'at-explore-1', perspective: 'explore', title: 'Esplora: trova sessioni rilevanti', description: 'Apri Esplora e usa filtri sport + orario per individuare eventi in linea.', to: '/explore' },
      { id: 'at-map-1', perspective: 'map', title: 'Mappa: valida distanza reale', description: 'Apri mappa live per capire quale opzione e piu comoda da raggiungere.', to: '/map' },
      { id: 'at-agenda-1', perspective: 'agenda', title: 'Agenda: pianifica la settimana', description: 'Usa Agenda personale per distribuire carico e continuita.', to: '/agenda' },
      { id: 'at-coach-1', perspective: 'coach', title: 'Trova Coach: valuta profili', description: 'Apri area coach e confronta profili in base ai tuoi obiettivi.', to: '/coach' },
      { id: 'at-convenzioni-1', perspective: 'convenzioni', title: 'Convenzioni: attiva vantaggi', description: 'Controlla convenzioni per sconti e opportunita utili alla routine.', to: '/convenzioni' },
      { id: 'at-pricing-1', perspective: 'pricing', title: 'Pricing: capisci limiti e upgrade', description: 'Apri pricing/salvadanaio per scegliere il modello piu adatto.', to: '/pricing' },
      { id: 'at-notifications-1', perspective: 'notifications', title: 'Notifiche: resta aggiornato', description: 'Apri notifiche per monitorare cambiamenti e reminder eventi.', to: '/notifications' },
      { id: 'at-account-1', perspective: 'account', title: 'Account: completa profilo', description: 'Aggiorna account con bio e immagine per migliorare esperienza social.', to: '/account' },
      { id: 'at-faq-1', perspective: 'faq', title: 'FAQ: chiudi dubbi operativi', description: 'Consulta FAQ per risolvere rapidamente dubbi e casi comuni.', to: '/faq' }
    ]
  },
  organizzatore: {
    full: [
      { id: 'org-create-1', perspective: 'create', title: 'Crea: pubblica sessione completa', description: 'Compila titolo, descrizione, orario e luogo in modo chiaro.', to: '/create' },
      { id: 'org-explore-1', perspective: 'explore', title: 'Esplora: verifica resa card', description: 'Controlla come la tua sessione appare agli utenti.', to: '/explore' },
      { id: 'org-agenda-1', perspective: 'agenda', title: 'Agenda: bilancia calendario', description: 'Distribuisci sessioni per evitare sovraccarico.', to: '/agenda' },
      { id: 'org-notifications-1', perspective: 'notifications', title: 'Notifiche: rispondi veloce', description: 'Gestisci aggiornamenti e richieste in tempo utile.', to: '/notifications' },
      { id: 'org-pricing-1', perspective: 'pricing', title: 'Pricing: controlla limiti', description: 'Valuta piano e possibilita di upgrade.', to: '/pricing' },
      { id: 'org-account-1', perspective: 'account', title: 'Account: rinforza fiducia', description: 'Aggiorna bio e immagine profilo organizzatore.', to: '/account' },
      { id: 'org-faq-1', perspective: 'faq', title: 'FAQ: allinea policy', description: 'Rivedi regole e risposte operative standard.', to: '/faq' }
    ]
  },
  coach: {
    full: [
      { id: 'coach-become-1', perspective: 'become-coach', title: 'Diventa Coach: candidatura', description: 'Compila candidatura e verifica tempi/attese approvazione.', to: '/become-coach' },
      { id: 'coach-profile-1', perspective: 'coach', title: 'Profilo Coach: posizionamento', description: 'Controlla come appare il tuo profilo nel marketplace.', to: '/coach' },
      { id: 'coach-dashboard-1', perspective: 'dashboard', title: 'Dashboard: imposta offerta', description: 'Configura struttura servizi e gestione operativa.', to: '/dashboard/coach' },
      { id: 'coach-plans-1', perspective: 'plans', title: 'Le mie schede: piani cliente', description: 'Costruisci percorsi progressivi concreti.', to: '/dashboard/plans' },
      { id: 'coach-notifications-1', perspective: 'notifications', title: 'Notifiche: follow-up clienti', description: 'Gestisci richieste e feedback rapidamente.', to: '/notifications' },
      { id: 'coach-account-1', perspective: 'account', title: 'Account: identita professionale', description: 'Aggiorna bio, immagine e disponibilita.', to: '/account' },
      { id: 'coach-faq-1', perspective: 'faq', title: 'FAQ: casi comuni', description: 'Consulta risposte standard per ridurre attriti.', to: '/faq' },
      { id: 'coach-pricing-1', perspective: 'pricing', title: 'Pricing: limiti e crescita', description: 'Verifica piano attivo e possibilita di espansione.', to: '/pricing' }
    ]
  },
  partner: {
    full: [
      { id: 'partner-convenzioni-1', perspective: 'convenzioni', title: 'Candidatura convenzioni struttura', description: 'Apri Convenzioni, compila candidatura associazione/palestra e monitora stato (pending/approved).', to: '/convenzioni' },
      { id: 'partner-pricing-1', perspective: 'pricing', title: 'Piano promo struttura', description: 'Confronta Free/Premium in base a numero promo, corsi e obiettivi commerciali.', to: '/pricing' },
      { id: 'partner-account-1', perspective: 'account', title: 'Profilo struttura verificabile', description: 'Aggiorna account con dati coerenti (contatti, immagine, descrizione) per revisione piu veloce.', to: '/account' },
      { id: 'partner-faq-1', perspective: 'faq', title: 'Tempi di attesa e regole operative', description: 'Consulta FAQ per capire iter di approvazione, attese e gestione anomalie.', to: '/faq' }
    ]
  }
};

const ACTION_STEP_MAP = {
  event_created: ['org-create-1'],
  rsvp_confirmed: ['at-explore-1'],
  profile_completed: ['at-account-1', 'org-account-1', 'coach-account-1', 'partner-account-1'],
  coach_applied: ['coach-become-1']
};

const DEFAULT_STATE = {
  status: 'idle',
  phase: 'overview',
  selectedRole: 'atleta',
  selectedPerspective: 'explore',
  selectedGoal: null,
  estimatedMinutes: null,
  resumeRoute: '',
  startedAt: null,
  completedAt: null,
  currentStepIndex: -1,
  completedStepIds: []
};

function getDefaultPerspective(roleId) {
  const list = PERSPECTIVE_CATALOG[roleId] || [];
  return list[0]?.id || DEFAULT_STATE.selectedPerspective;
}

function isValidRole(roleId) {
  return ROLE_CATALOG.some((item) => item.id === roleId);
}

function isValidPerspective(roleId, perspectiveId) {
  return (PERSPECTIVE_CATALOG[roleId] || []).some((item) => item.id === perspectiveId);
}

function resolvePerspective(roleId, perspectiveId) {
  return isValidPerspective(roleId, perspectiveId) ? perspectiveId : getDefaultPerspective(roleId);
}

function getGoalList(roleId) {
  return GOAL_CATALOG[roleId] || [];
}

function getGoalById(roleId, goalId) {
  return getGoalList(roleId).find((item) => item.id === goalId) || null;
}

function resolveGoal(roleId, goalId) {
  if (!goalId) return null;
  return getGoalById(roleId, goalId)?.id || null;
}

function estimateMinutes(track, goalMeta) {
  if (Number.isFinite(goalMeta?.estimatedMinutes) && goalMeta.estimatedMinutes > 0) {
    return goalMeta.estimatedMinutes;
  }
  if (!Array.isArray(track) || !track.length) return null;
  return Math.max(4, track.length * 2);
}

function getStartIndexForSelection(roleId, perspectiveId, track) {
  if (!Array.isArray(track) || !track.length) return 0;
  const idx = track.findIndex((step) => String(step?.perspective || '') === String(perspectiveId || ''));
  return idx >= 0 ? idx : 0;
}

function normalizeState(input) {
  const state = input && typeof input === 'object' ? input : {};
  const selectedRole = isValidRole(state.selectedRole) ? state.selectedRole : DEFAULT_STATE.selectedRole;
  const selectedGoal = resolveGoal(selectedRole, state.selectedGoal);
  const goalMeta = getGoalById(selectedRole, selectedGoal);
  const selectedPerspective = resolvePerspective(selectedRole, state.selectedPerspective || goalMeta?.perspective);
  const track = getTutorialTrack(selectedRole, selectedPerspective);
  const completedStepIds = Array.isArray(state.completedStepIds)
    ? state.completedStepIds.filter((id) => track.some((step) => step.id === id))
    : [];
  const maxIndex = Math.max(-1, track.length - 1);
  const currentStepIndex = Number.isInteger(state.currentStepIndex)
    ? Math.max(-1, Math.min(maxIndex, state.currentStepIndex))
    : DEFAULT_STATE.currentStepIndex;

  return {
    ...DEFAULT_STATE,
    ...state,
    selectedRole,
    selectedPerspective,
    selectedGoal,
    estimatedMinutes: Number.isFinite(state.estimatedMinutes)
      ? state.estimatedMinutes
      : estimateMinutes(track, goalMeta),
    resumeRoute: typeof state.resumeRoute === 'string'
      ? state.resumeRoute
      : String(track[Math.max(0, currentStepIndex)]?.to || ''),
    currentStepIndex,
    completedStepIds
  };
}

function persist(nextState) {
  safeStorageSet(TUTORIAL_KEY, JSON.stringify(nextState));
  return nextState;
}

export function getRoleCatalog() {
  return ROLE_CATALOG.slice();
}

export function getPerspectiveCatalog(roleId) {
  return (PERSPECTIVE_CATALOG[roleId] || []).slice();
}

export function getGoalCatalog(roleId) {
  return getGoalList(roleId).slice();
}

export function getSiteFunctions() {
  return SITE_FUNCTIONS.slice();
}

export function getSiteFunctionsByRole(roleId) {
  if (!isValidRole(roleId)) return SITE_FUNCTIONS.slice();
  return SITE_FUNCTIONS.filter((item) => Array.isArray(item.audience) && item.audience.includes(roleId));
}

export function getTutorialTrack(roleId, perspectiveId) {
  const roleTracks = TUTORIAL_TRACKS[roleId] || {};
  const perspective = resolvePerspective(roleId, perspectiveId);
  if (Array.isArray(roleTracks.full)) return roleTracks.full.slice();
  return (roleTracks[perspective] || []).slice();
}

export function getTutorialState() {
  const raw = safeStorageGet(TUTORIAL_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setTutorialRole(roleId) {
  const current = getTutorialState();
  const selectedRole = isValidRole(roleId) ? roleId : current.selectedRole;
  const selectedPerspective = getDefaultPerspective(selectedRole);
  const selectedGoal = resolveGoal(selectedRole, current.selectedGoal);
  const goalMeta = getGoalById(selectedRole, selectedGoal);
  const track = getTutorialTrack(selectedRole, selectedPerspective);
  const startIndex = getStartIndexForSelection(selectedRole, selectedPerspective, track);
  const next = normalizeState({
    ...current,
    selectedRole,
    selectedPerspective,
    selectedGoal,
    estimatedMinutes: estimateMinutes(track, goalMeta),
    resumeRoute: String(track[Math.max(0, startIndex)]?.to || ''),
    completedStepIds: [],
    currentStepIndex: current.status === 'active' ? startIndex : -1
  });
  return persist(next);
}

export function setTutorialPerspective(perspectiveId) {
  const current = getTutorialState();
  const selectedPerspective = resolvePerspective(current.selectedRole, perspectiveId);
  const selectedGoal = resolveGoal(current.selectedRole, current.selectedGoal);
  const goalMeta = getGoalById(current.selectedRole, selectedGoal);
  const track = getTutorialTrack(current.selectedRole, selectedPerspective);
  const nextStartIndex = getStartIndexForSelection(current.selectedRole, selectedPerspective, track);
  const next = normalizeState({
    ...current,
    selectedPerspective,
    selectedGoal,
    estimatedMinutes: estimateMinutes(track, goalMeta),
    resumeRoute: String(track[Math.max(0, nextStartIndex)]?.to || ''),
    completedStepIds: [],
    currentStepIndex: current.status === 'active' ? nextStartIndex : -1
  });
  return persist(next);
}

export function setTutorialGoal(goalId) {
  const current = getTutorialState();
  const selectedGoal = resolveGoal(current.selectedRole, goalId);
  const goalMeta = getGoalById(current.selectedRole, selectedGoal);
  const selectedPerspective = resolvePerspective(
    current.selectedRole,
    goalMeta?.perspective || current.selectedPerspective
  );
  const track = getTutorialTrack(current.selectedRole, selectedPerspective);
  const startIndex = getStartIndexForSelection(current.selectedRole, selectedPerspective, track);
  const next = normalizeState({
    ...current,
    selectedGoal,
    selectedPerspective,
    estimatedMinutes: estimateMinutes(track, goalMeta),
    resumeRoute: String(track[Math.max(0, startIndex)]?.to || ''),
    completedStepIds: [],
    currentStepIndex: current.status === 'active' ? startIndex : -1
  });
  return persist(next);
}

export function startTutorial(roleId, perspectiveId, goalId) {
  const current = getTutorialState();
  const selectedRole = isValidRole(roleId) ? roleId : current.selectedRole;
  const selectedGoal = resolveGoal(selectedRole, goalId ?? current.selectedGoal);
  const goalMeta = getGoalById(selectedRole, selectedGoal);
  const selectedPerspective = resolvePerspective(
    selectedRole,
    perspectiveId || goalMeta?.perspective || current.selectedPerspective
  );
  const track = getTutorialTrack(selectedRole, selectedPerspective);
  const startIndex = getStartIndexForSelection(selectedRole, selectedPerspective, track);
  const next = normalizeState({
    ...current,
    status: 'active',
    phase: 'inizia_tutorial',
    selectedRole,
    selectedPerspective,
    selectedGoal,
    estimatedMinutes: estimateMinutes(track, goalMeta),
    startedAt: new Date().toISOString(),
    completedAt: null,
    resumeRoute: String(track[Math.max(0, startIndex)]?.to || ''),
    currentStepIndex: startIndex,
    completedStepIds: []
  });
  return persist(next);
}

export function completeCurrentStep() {
  const current = getTutorialState();
  const track = getTutorialTrack(current.selectedRole, current.selectedPerspective);
  if (current.status !== 'active' || !track.length) return current;

  const index = Math.max(0, current.currentStepIndex);
  const currentStep = track[index];
  const completedStepIds = currentStep
    ? Array.from(new Set([...current.completedStepIds, currentStep.id]))
    : current.completedStepIds.slice();

  const reachedEnd = index >= track.length - 1;
  const nextIndex = reachedEnd ? index : index + 1;
  const resumeRoute = reachedEnd
    ? '/tutorial'
    : String(track[Math.max(0, nextIndex)]?.to || '');
  const next = normalizeState({
    ...current,
    completedStepIds,
    currentStepIndex: nextIndex,
    resumeRoute,
    status: reachedEnd ? 'done' : 'active',
    phase: reachedEnd ? 'completed' : current.phase,
    completedAt: reachedEnd ? new Date().toISOString() : null
  });
  return persist(next);
}

export function goToTutorialStep(targetIndex) {
  const current = getTutorialState();
  const track = getTutorialTrack(current.selectedRole, current.selectedPerspective);
  if (!track.length) return current;
  const clamped = Math.max(0, Math.min(track.length - 1, Number(targetIndex) || 0));
  const completedStepIds = track
    .slice(0, clamped)
    .map((step) => step.id)
    .filter(Boolean);
  const next = normalizeState({
    ...current,
    status: 'active',
    phase: 'inizia_tutorial',
    currentStepIndex: clamped,
    resumeRoute: String(track[Math.max(0, clamped)]?.to || ''),
    completedStepIds,
    completedAt: null
  });
  return persist(next);
}

export function markStepByAction(actionKey, context = {}) {
  const current = getTutorialState();
  if (current.status !== 'active') return current;
  const track = getTutorialTrack(current.selectedRole, current.selectedPerspective);
  if (!track.length) return current;

  const contextStepId = typeof context.stepId === 'string' ? context.stepId : '';
  const candidateIds = contextStepId ? [contextStepId] : (ACTION_STEP_MAP[actionKey] || []);
  const matchedIds = candidateIds.filter((id) => track.some((step) => step.id === id));
  if (!matchedIds.length) return current;

  const completedStepIds = Array.from(new Set([...current.completedStepIds, ...matchedIds]));
  const allDone = track.every((step) => completedStepIds.includes(step.id));
  const firstPendingIndex = track.findIndex((step) => !completedStepIds.includes(step.id));
  const nextIndex = allDone ? track.length - 1 : Math.max(0, firstPendingIndex);
  const next = normalizeState({
    ...current,
    completedStepIds,
    currentStepIndex: nextIndex,
    resumeRoute: allDone ? '/tutorial' : String(track[Math.max(0, nextIndex)]?.to || ''),
    status: allDone ? 'done' : 'active',
    phase: allDone ? 'completed' : current.phase,
    completedAt: allDone ? new Date().toISOString() : null
  });
  return persist(next);
}

export function resetTutorial() {
  return persist({ ...DEFAULT_STATE });
}
