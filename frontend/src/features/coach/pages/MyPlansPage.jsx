import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Dumbbell,
  Eye,
  Filter,
  GripVertical,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  X
} from 'lucide-react';
import Button from '../../../components/Button';
import BrandLogo from '../../../components/BrandLogo';
import Modal from '../../../components/Modal';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT_FILTERS,
  PERSONAL_EXERCISE_LIBRARY,
  STARTER_EXERCISE_IDS,
  WORKOUT_DURATIONS,
  WORKOUT_EQUIPMENT,
  WORKOUT_LEVELS,
  WORKOUT_SPORTS,
  getCategoryLabel,
  getLatestExercisePrescription,
  getExerciseSearchText,
  getSportById
} from '../data/personalWorkoutCatalog';
import { loadWorkoutExerciseHistory } from '../../workout/services/workoutSessionStore';
import {
  canSyncPersonalWorkoutPlans,
  getPersonalWorkoutPlansStorageKey,
  listCachedPersonalWorkoutPlans,
  deletePersonalWorkoutPlan,
  listPersonalWorkoutPlans,
  upsertPersonalWorkoutPlan
} from '../services/personalWorkoutPlansApi';
import styles from '../../../styles/pages/personalPlans.module.css';

const DELETED_STORAGE_SUFFIX = ':deleted';
const FAVORITES_STORAGE_SUFFIX = ':exercise-favorites';
const RECENT_STORAGE_SUFFIX = ':exercise-recent';
const CUSTOM_EXERCISES_STORAGE_SUFFIX = ':custom-exercises';
const ALL_CATEGORIES = [
  { id: 'all', label: 'Tutti' },
  { id: 'favorites', label: 'Preferiti' },
  { id: 'recent', label: 'Recenti' },
  ...EXERCISE_CATEGORIES
];
const ALL_EXERCISE_EQUIPMENT = [
  { id: 'all', label: 'Tutta' },
  ...EXERCISE_EQUIPMENT_FILTERS.map((label) => ({ id: label, label }))
];
const PLAN_EQUIPMENT_TO_CATALOG = {
  bilanciere: 'Bilanciere',
  manubri: 'Manubri',
  macchine: 'Macchina',
  cavi: 'Cavi',
  'corpo-libero': 'Corpo libero'
};

function uniqueId(prefix = 'item') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function copyValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function exerciseFromCatalog(item, prescription = null) {
  return {
    instanceId: uniqueId('exercise'),
    catalogId: item.id,
    name: item.name,
    category: item.category,
    equipment: item.equipment,
    sets: item.sets,
    reps: prescription?.reps || item.reps,
    weight: prescription?.weight ?? item.weight,
    rir: prescription?.rir ?? item.rir,
    recovery: item.recovery
  };
}

function loadStoredArray(key) {
  try {
    const value = JSON.parse(safeStorageGet(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function createCustomExerciseDraft() {
  return {
    name: '',
    category: 'petto',
    equipment: 'Corpo libero',
    sets: 3,
    reps: '10',
    weight: 0,
    rir: 2,
    recovery: 60
  };
}

function createStarterDraft() {
  const exercises = STARTER_EXERCISE_IDS.map((id) =>
    PERSONAL_EXERCISE_LIBRARY.find((item) => item.id === id)
  )
    .filter(Boolean)
    .map(exerciseFromCatalog);

  return {
    id: null,
    title: 'Push Day - Petto e Tricipiti',
    sportId: 'palestra',
    type: 'Bodybuilding',
    duration: 60,
    level: 'mid',
    equipment: ['bilanciere', 'manubri'],
    exercises
  };
}

function loadPendingDeletions(storageKey) {
  try {
    const value = JSON.parse(safeStorageGet(`${storageKey}${DELETED_STORAGE_SUFFIX}`) || '[]');
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function savePendingDeletions(storageKey, planIds) {
  safeStorageSet(
    `${storageKey}${DELETED_STORAGE_SUFFIX}`,
    JSON.stringify([...new Set(planIds.map(String).filter(Boolean))])
  );
}

function planUpdatedAt(plan) {
  const timestamp = Date.parse(String(plan?.updatedAt || plan?.createdAt || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortPlansByUpdate(items) {
  return [...items].sort((a, b) => planUpdatedAt(b) - planUpdatedAt(a));
}

function normalizeSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function draftSnapshot(value) {
  if (!value) return '';
  const { createdAt, updatedAt, remoteId, ...editable } = value;
  return JSON.stringify(editable);
}

function formatPlanDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'Mai aggiornata';
  return `Aggiornata ${new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(date)}`;
}

function MyPlansPage() {
  const { showToast } = useToast();
  const storageKey = useMemo(() => getPersonalWorkoutPlansStorageKey(), []);
  const initialPlans = useMemo(() => listCachedPersonalWorkoutPlans(), [storageKey]);
  const remoteSyncEnabled = useMemo(() => canSyncPersonalWorkoutPlans(), []);

  const [plans, setPlans] = useState(initialPlans);
  const [screen, setScreen] = useState(initialPlans.length || remoteSyncEnabled ? 'library' : 'editor');
  const [step, setStep] = useState(initialPlans.length ? 1 : 3);
  const [draft, setDraft] = useState(createStarterDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerEquipment, setPickerEquipment] = useState('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pendingExerciseIds, setPendingExerciseIds] = useState([]);
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState(() => (
    loadStoredArray(`${storageKey}${FAVORITES_STORAGE_SUFFIX}`).map(String)
  ));
  const [recentExerciseIds, setRecentExerciseIds] = useState(() => (
    loadStoredArray(`${storageKey}${RECENT_STORAGE_SUFFIX}`).map(String)
  ));
  const [customExercises, setCustomExercises] = useState(() => (
    loadStoredArray(`${storageKey}${CUSTOM_EXERCISES_STORAGE_SUFFIX}`)
  ));
  const [customExerciseDraft, setCustomExerciseDraft] = useState(createCustomExerciseDraft);
  const [customExerciseOpen, setCustomExerciseOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [draggedExerciseIndex, setDraggedExerciseIndex] = useState(null);
  const [syncState, setSyncState] = useState(remoteSyncEnabled ? 'syncing' : 'local');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySport, setLibrarySport] = useState('all');
  const [planPendingDelete, setPlanPendingDelete] = useState(null);
  const [editorClosePending, setEditorClosePending] = useState(false);
  const [draftError, setDraftError] = useState('');
  const lastExerciseRef = useRef(null);
  const exerciseEditorPanelRef = useRef(null);
  const draftBaselineRef = useRef(draftSnapshot(draft));
  const editorDismissedRef = useRef(false);

  usePageMeta({
    title: 'Schede personali | Motrice',
    description: 'Crea, modifica e salva le tue schede di allenamento personali.'
  });

  const currentSport = getSportById(draft.sportId);
  const workoutHistory = useMemo(() => loadWorkoutExerciseHistory(), []);
  const exerciseLibrary = useMemo(() => {
    const catalogIds = new Set(PERSONAL_EXERCISE_LIBRARY.map((exercise) => exercise.id));
    const validCustom = customExercises.filter((exercise) => (
      exercise?.id && exercise?.name && !catalogIds.has(exercise.id)
    ));
    return [...validCustom, ...PERSONAL_EXERCISE_LIBRARY];
  }, [customExercises]);
  const favoriteExerciseIdSet = useMemo(() => new Set(favoriteExerciseIds), [favoriteExerciseIds]);
  const recentExerciseIdSet = useMemo(() => new Set(recentExerciseIds), [recentExerciseIds]);
  const latestPrescriptions = useMemo(() => new Map(
    exerciseLibrary.map((exercise) => [
      exercise.id,
      getLatestExercisePrescription(exercise, workoutHistory)
    ])
  ), [exerciseLibrary, workoutHistory]);
  const addedExerciseIds = useMemo(
    () => new Set(draft.exercises.map((exercise) => exercise.catalogId)),
    [draft.exercises]
  );
  const filteredExercises = useMemo(() => {
    const query = normalizeSearch(pickerQuery);
    const filtered = exerciseLibrary.filter((exercise) => {
      if (pickerCategory === 'favorites' && !favoriteExerciseIdSet.has(exercise.id)) return false;
      if (pickerCategory === 'recent' && !recentExerciseIdSet.has(exercise.id)) return false;
      if (!['all', 'favorites', 'recent'].includes(pickerCategory) && exercise.category !== pickerCategory) return false;
      if (pickerEquipment !== 'all' && exercise.equipment !== pickerEquipment) return false;
      if (!query) return true;
      return normalizeSearch(getExerciseSearchText(exercise)).includes(query);
    });
    if (pickerCategory !== 'recent') return filtered;
    const recentOrder = new Map(recentExerciseIds.map((id, index) => [id, index]));
    return filtered.sort((left, right) => (
      (recentOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (recentOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  }, [exerciseLibrary, favoriteExerciseIdSet, pickerCategory, pickerEquipment, pickerQuery, recentExerciseIdSet, recentExerciseIds]);
  const visiblePlans = useMemo(() => {
    const query = normalizeSearch(libraryQuery);
    return plans.filter((plan) => {
      if (librarySport !== 'all' && plan.sportId !== librarySport) return false;
      if (!query) return true;
      const exercises = (plan.exercises || []).map((exercise) => exercise.name).join(' ');
      return normalizeSearch(`${plan.title} ${plan.type} ${getSportById(plan.sportId).label} ${exercises}`).includes(query);
    });
  }, [libraryQuery, librarySport, plans]);
  const availableSports = useMemo(() => (
    WORKOUT_SPORTS.filter((sport) => plans.some((plan) => plan.sportId === sport.id))
  ), [plans]);
  const totalExercises = useMemo(() => (
    plans.reduce((total, plan) => total + (Array.isArray(plan.exercises) ? plan.exercises.length : 0), 0)
  ), [plans]);
  const hasUnsavedChanges = screen === 'editor' && draftSnapshot(draft) !== draftBaselineRef.current;

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!editingExercise) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (exerciseEditorPanelRef.current) exerciseEditorPanelRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingExercise?.instanceId]);

  useEffect(() => {
    if (!planPendingDelete) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPlanPendingDelete(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [planPendingDelete]);

  useEffect(() => {
    if (!remoteSyncEnabled) return undefined;
    let active = true;

    async function synchronizePlans() {
      setSyncState('syncing');
      try {
        const pendingDeletions = loadPendingDeletions(storageKey);
        const failedDeletions = [];
        let remainingDeletions = [...pendingDeletions];
        for (const planId of pendingDeletions) {
          try {
            await deletePersonalWorkoutPlan(planId);
            remainingDeletions = remainingDeletions.filter((id) => id !== planId);
            savePendingDeletions(storageKey, remainingDeletions);
          } catch {
            failedDeletions.push(planId);
          }
        }

        const localPlans = listCachedPersonalWorkoutPlans();
        const pendingDeletionIds = new Set(failedDeletions);
        const remotePlans = (await listPersonalWorkoutPlans())
          .filter((plan) => !pendingDeletionIds.has(String(plan.id)));
        const mergedById = new Map(remotePlans.map((plan) => [String(plan.id), plan]));

        for (const localPlan of localPlans) {
          const remotePlan = mergedById.get(String(localPlan.id));
          if (!remotePlan || planUpdatedAt(localPlan) > planUpdatedAt(remotePlan)) {
            const syncedPlan = await upsertPersonalWorkoutPlan(localPlan);
            mergedById.set(String(syncedPlan.id), syncedPlan);
          }
        }

        const nextPlans = sortPlansByUpdate([...mergedById.values()]);
        if (!active) return;
        setPlans(nextPlans);
        safeStorageSet(storageKey, JSON.stringify(nextPlans));
        setSyncState(failedDeletions.length ? 'offline' : 'synced');
        if (!nextPlans.length && !initialPlans.length && !editorDismissedRef.current) {
          setScreen('editor');
          setStep(3);
        }
      } catch {
        if (!active) return;
        setSyncState('offline');
        if (!initialPlans.length && !editorDismissedRef.current) {
          setScreen('editor');
          setStep(3);
        }
      }
    }

    synchronizePlans();
    window.addEventListener('online', synchronizePlans);
    return () => {
      active = false;
      window.removeEventListener('online', synchronizePlans);
    };
  }, [initialPlans.length, remoteSyncEnabled, storageKey]);

  function persistPlans(nextPlans) {
    setPlans(nextPlans);
    safeStorageSet(storageKey, JSON.stringify(nextPlans));
  }

  function startNewPlan() {
    const nextDraft = createStarterDraft();
    editorDismissedRef.current = false;
    draftBaselineRef.current = draftSnapshot(nextDraft);
    setDraft(nextDraft);
    setStep(1);
    setScreen('editor');
    setDraftError('');
  }

  function openPlan(plan) {
    const nextDraft = copyValue(plan);
    editorDismissedRef.current = false;
    draftBaselineRef.current = draftSnapshot(nextDraft);
    setDraft(nextDraft);
    setStep(3);
    setScreen('editor');
    setDraftError('');
  }

  function completeEditorClose() {
    editorDismissedRef.current = true;
    setEditorClosePending(false);
    setScreen('library');
    setStep(1);
    setPickerOpen(false);
    setEditingExercise(null);
  }

  function closeEditor() {
    if (hasUnsavedChanges) {
      setEditorClosePending(true);
      return;
    }
    completeEditorClose();
  }

  function selectSport(sportId) {
    const sport = getSportById(sportId);
    setDraft((current) => ({
      ...current,
      sportId,
      type: sport.types[0],
      title: sportId === 'palestra' ? 'Push Day - Petto e Tricipiti' : `${sport.types[0]} ${sport.label}`,
      exercises: sportId === 'palestra' ? createStarterDraft().exercises : []
    }));
  }

  function selectType(type) {
    setDraft((current) => ({
      ...current,
      type,
      title: current.title || `${type} ${getSportById(current.sportId).label}`
    }));
  }

  function toggleEquipment(equipmentId) {
    setDraft((current) => ({
      ...current,
      equipment: current.equipment.includes(equipmentId)
        ? current.equipment.filter((id) => id !== equipmentId)
        : [...current.equipment, equipmentId]
    }));
  }

  function validateDraft() {
    if (String(draft.title || '').trim().length < 3) {
      setDraftError('title');
      showToast('Inserisci un nome per la scheda', 'error');
      return false;
    }
    if (!draft.exercises.length) {
      setDraftError('exercises');
      showToast('Aggiungi almeno un esercizio', 'error');
      return false;
    }
    setDraftError('');
    return true;
  }

  function previewDraft() {
    if (!validateDraft()) return;
    setStep(4);
  }

  async function syncSavedPlan(plan, successMessage) {
    if (!remoteSyncEnabled) {
      showToast(successMessage, 'success');
      return;
    }
    setSyncState('syncing');
    try {
      const syncedPlan = await upsertPersonalWorkoutPlan(plan);
      const nextPlans = sortPlansByUpdate(
        plans.some((item) => item.id === syncedPlan.id)
          ? plans.map((item) => (item.id === syncedPlan.id ? syncedPlan : item))
          : [syncedPlan, ...plans]
      );
      persistPlans(nextPlans);
      setSyncState('synced');
      showToast(`${successMessage} e sincronizzata`, 'success');
    } catch {
      setSyncState('offline');
      showToast(`${successMessage} sul dispositivo. Il server verrà riallineato al prossimo accesso.`, 'error');
    }
  }

  async function saveDraft() {
    if (!validateDraft()) return;
    const now = new Date().toISOString();
    const savedPlan = {
      ...copyValue(draft),
      id: draft.id || uniqueId('plan'),
      title: draft.title.trim(),
      createdAt: draft.createdAt || now,
      updatedAt: now
    };
    const existingIndex = plans.findIndex((plan) => plan.id === savedPlan.id);
    const nextPlans = existingIndex >= 0
      ? plans.map((plan, index) => (index === existingIndex ? savedPlan : plan))
      : [savedPlan, ...plans];
    persistPlans(nextPlans);
    setDraft(savedPlan);
    draftBaselineRef.current = draftSnapshot(savedPlan);
    setScreen('library');
    setStep(1);
    await syncSavedPlan(savedPlan, existingIndex >= 0 ? 'Scheda aggiornata' : 'Scheda personale salvata');
  }

  async function deletePlan(planId) {
    persistPlans(plans.filter((plan) => plan.id !== planId));
    if (!remoteSyncEnabled) {
      showToast('Scheda eliminata', 'success');
      return;
    }

    const pending = [...loadPendingDeletions(storageKey), String(planId)];
    savePendingDeletions(storageKey, pending);
    setSyncState('syncing');
    try {
      await deletePersonalWorkoutPlan(planId);
      savePendingDeletions(storageKey, pending.filter((id) => id !== String(planId)));
      setSyncState('synced');
      showToast('Scheda eliminata dal dispositivo e dal server', 'success');
    } catch {
      setSyncState('offline');
      showToast('Scheda eliminata sul dispositivo. La rimozione dal server è in attesa.', 'error');
    }
  }

  function openExercisePicker() {
    const selectedEquipment = draft.equipment
      .map((equipment) => PLAN_EQUIPMENT_TO_CATALOG[equipment])
      .filter(Boolean);
    setPendingExerciseIds([]);
    setPickerQuery('');
    setPickerCategory('all');
    setPickerEquipment(selectedEquipment.length === 1 ? selectedEquipment[0] : 'all');
    setPickerOpen(true);
  }

  function closeExercisePicker() {
    setPendingExerciseIds([]);
    setPickerOpen(false);
  }

  function togglePickerExercise(item) {
    if (addedExerciseIds.has(item.id)) {
      showToast('Esercizio già presente nella scheda', 'error');
      return;
    }

    setPendingExerciseIds((current) => current.includes(item.id)
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
  }

  function toggleFavoriteExercise(exerciseId) {
    setFavoriteExerciseIds((current) => {
      const next = current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [exerciseId, ...current];
      safeStorageSet(`${storageKey}${FAVORITES_STORAGE_SUFFIX}`, JSON.stringify(next));
      return next;
    });
  }

  function openCustomExerciseCreator() {
    setCustomExerciseDraft(createCustomExerciseDraft());
    setCustomExerciseOpen(true);
  }

  function saveCustomExercise() {
    const name = String(customExerciseDraft.name || '').trim();
    if (name.length < 2) {
      showToast('Inserisci il nome dell’esercizio', 'error');
      return;
    }

    const nameSlug = normalizeSearch(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'esercizio';
    const exercise = {
      id: uniqueId(`custom-${nameSlug}`),
      name: name.slice(0, 70),
      category: customExerciseDraft.category,
      equipment: customExerciseDraft.equipment,
      sets: Math.max(1, Math.min(20, Number(customExerciseDraft.sets) || 3)),
      reps: String(customExerciseDraft.reps || '10').trim().slice(0, 20) || '10',
      weight: Math.max(0, Number(customExerciseDraft.weight) || 0),
      rir: Math.max(0, Math.min(5, Number(customExerciseDraft.rir) || 0)),
      recovery: Math.max(0, Math.min(900, Number(customExerciseDraft.recovery) || 0)),
      custom: true
    };

    setCustomExercises((current) => {
      const next = [exercise, ...current];
      safeStorageSet(`${storageKey}${CUSTOM_EXERCISES_STORAGE_SUFFIX}`, JSON.stringify(next));
      return next;
    });
    setPendingExerciseIds((current) => [exercise.id, ...current.filter((id) => id !== exercise.id)]);
    setPickerCategory('all');
    setPickerEquipment('all');
    setPickerQuery('');
    setCustomExerciseOpen(false);
    showToast('Esercizio personale creato e selezionato', 'success');
  }

  function confirmExerciseSelection() {
    const selectedExercises = pendingExerciseIds
      .map((id) => exerciseLibrary.find((item) => item.id === id))
      .filter(Boolean);
    if (!selectedExercises.length) return;

    setDraft((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        ...selectedExercises.map((exercise) => exerciseFromCatalog(
          exercise,
          latestPrescriptions.get(exercise.id)
        ))
      ]
    }));
    setRecentExerciseIds((current) => {
      const selectedIds = selectedExercises.map((exercise) => exercise.id);
      const next = [...selectedIds, ...current.filter((id) => !selectedIds.includes(id))].slice(0, 12);
      safeStorageSet(`${storageKey}${RECENT_STORAGE_SUFFIX}`, JSON.stringify(next));
      return next;
    });
    setDraftError('');
    setPendingExerciseIds([]);
    setPickerOpen(false);
    showToast(
      selectedExercises.length === 1
        ? `${selectedExercises[0].name} aggiunto alla scheda`
        : `${selectedExercises.length} esercizi aggiunti alla scheda`,
      'success'
    );
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        lastExerciseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function removeExercise(index) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index)
    }));
  }

  function duplicateExercise(index) {
    setDraft((current) => {
      const source = current.exercises[index];
      const duplicate = { ...copyValue(source), instanceId: uniqueId('exercise') };
      const exercises = [...current.exercises];
      exercises.splice(index + 1, 0, duplicate);
      return { ...current, exercises };
    });
  }

  function moveExercise(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= draft.exercises.length || fromIndex === toIndex) return;
    setDraft((current) => {
      const exercises = [...current.exercises];
      const [moved] = exercises.splice(fromIndex, 1);
      exercises.splice(toIndex, 0, moved);
      return { ...current, exercises };
    });
  }

  function openExerciseEditor(exercise, index) {
    setEditingExercise({ ...copyValue(exercise), index });
  }

  function saveExerciseEditor() {
    if (!editingExercise) return;
    if (!String(editingExercise.name || '').trim()) {
      showToast('Inserisci il nome dell’esercizio', 'error');
      return;
    }
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === editingExercise.index
          ? {
              ...exercise,
              name: editingExercise.name.trim(),
              sets: Math.max(1, Number(editingExercise.sets) || 1),
              reps: String(editingExercise.reps || '').trim() || '10',
              weight: Math.max(0, Number(editingExercise.weight) || 0),
              rir: Math.max(0, Math.min(5, Number(editingExercise.rir) || 0)),
              recovery: Math.max(0, Number(editingExercise.recovery) || 0)
            }
          : exercise
      )
    }));
    setEditingExercise(null);
  }

  function renderProgress() {
    const progressSteps = [
      { id: 1, label: 'Sport' },
      { id: 2, label: 'Tipo' },
      { id: 3, label: 'Esercizi' },
      { id: 4, label: 'Riepilogo' }
    ];
    return (
      <div className={styles.progress} aria-label={`Passaggio ${step} di 4`}>
        {progressSteps.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.progressStep} ${item.id <= step ? styles.progressStepActive : ''}`}
            onClick={() => {
              if (item.id < step) setStep(item.id);
            }}
            disabled={item.id > step}
          >
            <span />
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  function renderSportStep() {
    return (
      <div className={styles.selectionStep}>
        <p className={styles.eyebrow}>Passaggio 1 di 4</p>
        <h2>Scegli lo sport</h2>
        <p className={styles.stepLead}>Partiamo dal contesto della tua sessione personale.</p>
        <div className={styles.sportGrid}>
          {WORKOUT_SPORTS.map((sport) => (
            <button
              key={sport.id}
              type="button"
              className={`${styles.sportCard} ${draft.sportId === sport.id ? styles.sportCardActive : ''}`}
              onClick={() => selectSport(sport.id)}
              aria-pressed={draft.sportId === sport.id}
            >
              <span className={styles.sportEmoji}>{sport.emoji}</span>
              <strong>{sport.label}</strong>
              {draft.sportId === sport.id ? <Check size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <Button type="button" size="lg" fullWidth onClick={() => setStep(2)}>Continua</Button>
      </div>
    );
  }

  function renderTypeStep() {
    return (
      <div className={styles.selectionStep}>
        <p className={styles.eyebrow}>Passaggio 2 di 4</p>
        <h2>Che tipo di allenamento?</h2>
        <p className={styles.stepLead}>Scegli il formato più vicino al tuo obiettivo.</p>
        <div className={styles.typeGrid}>
          {currentSport.types.map((type) => (
            <button
              key={type}
              type="button"
              className={`${styles.typeCard} ${draft.type === type ? styles.typeCardActive : ''}`}
              onClick={() => selectType(type)}
              aria-pressed={draft.type === type}
            >
              <Dumbbell size={22} aria-hidden="true" />
              <strong>{type}</strong>
              {draft.type === type ? <Check size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <div className={styles.twoActions}>
          <Button type="button" variant="secondary" onClick={() => setStep(1)}>Indietro</Button>
          <Button type="button" onClick={() => setStep(3)}>Continua agli esercizi</Button>
        </div>
      </div>
    );
  }

  function renderExerciseCard(exercise, index) {
    const categoryLabel = getCategoryLabel(exercise.category);
    return (
      <article
        key={exercise.instanceId}
        ref={index === draft.exercises.length - 1 ? lastExerciseRef : undefined}
        className={styles.exerciseCard}
        draggable
        onDragStart={() => setDraggedExerciseIndex(index)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => {
          if (draggedExerciseIndex != null) moveExercise(draggedExerciseIndex, index);
          setDraggedExerciseIndex(null);
        }}
      >
        <div className={styles.exerciseOrder}>
          <GripVertical size={15} aria-hidden="true" />
          <strong>{String(index + 1).padStart(2, '0')}</strong>
          <button type="button" onClick={() => moveExercise(index, index - 1)} disabled={index === 0} aria-label={`Sposta ${exercise.name} sopra`}>
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => moveExercise(index, index + 1)} disabled={index === draft.exercises.length - 1} aria-label={`Sposta ${exercise.name} sotto`}>
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.exerciseMain}>
          <div className={styles.exerciseTitleRow}>
            <h3>{exercise.name}</h3>
            <span>{categoryLabel}</span>
          </div>
          <p className={styles.exercisePrescription}>
            <strong>{exercise.sets} × {exercise.reps}</strong>
            {Number(exercise.weight) > 0 ? <span>{exercise.weight} kg</span> : null}
            <span>RIR {exercise.rir}</span>
            {Number(exercise.recovery) > 0 ? <span>Recupero {exercise.recovery} sec</span> : null}
          </p>
          <div className={styles.exerciseActions}>
            <button type="button" onClick={() => openExerciseEditor(exercise, index)}><Pencil size={14} /> Modifica</button>
            <button type="button" onClick={() => duplicateExercise(index)}><Copy size={14} /> Duplica</button>
            <button type="button" onClick={() => removeExercise(index)} aria-label={`Elimina ${exercise.name}`}><Trash2 size={14} /></button>
          </div>
        </div>
      </article>
    );
  }

  function renderBuilderStep() {
    const totalSets = draft.exercises.reduce((total, exercise) => total + Math.max(1, Number(exercise.sets) || 1), 0);
    return (
      <div className={styles.builderStep}>
        <div className={styles.builderTopbar}>
          <button type="button" className={styles.circleButton} onClick={() => setStep(2)} aria-label="Torna al tipo di allenamento">
            <span aria-hidden="true">←</span>
          </button>
          <span className={styles.builderSummary}>{draft.exercises.length} esercizi · {totalSets} serie</span>
        </div>

        <div className={styles.builderHeading}>
          <p className={styles.eyebrow}>{draft.id ? 'Modifica routine' : 'Nuova routine'}</p>
          <h2>Componi la scheda</h2>
        </div>
        <div className={styles.contextBadges}>
          <span>Sport: {currentSport.label}</span>
          <span>{draft.type}</span>
        </div>

        <label className={`${styles.fieldLabel} ${draftError === 'title' ? styles.fieldLabelError : ''}`}>
          <span>Nome della scheda</span>
          <input
            value={draft.title}
            onChange={(event) => {
              setDraft((current) => ({ ...current, title: event.target.value.slice(0, 70) }));
              if (draftError === 'title') setDraftError('');
            }}
            placeholder="Es. Push Day - Petto e Tricipiti"
            aria-invalid={draftError === 'title'}
            aria-describedby={draftError === 'title' ? 'plan-title-error' : undefined}
          />
          {draftError === 'title' ? <small id="plan-title-error" className={styles.inlineError}>Inserisci almeno 3 caratteri.</small> : null}
        </label>

        <section className={styles.settingsSection}>
          <h3>Impostazioni</h3>
          <div className={styles.settingRow}>
            <span className={styles.settingName}><Clock3 size={18} /> Durata</span>
            <div className={styles.segmented}>
              {WORKOUT_DURATIONS.map((duration) => (
                <button key={duration} type="button" className={draft.duration === duration ? styles.segmentActive : ''} onClick={() => setDraft((current) => ({ ...current, duration }))} aria-pressed={draft.duration === duration}>
                  {duration}m
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingName}>Livello</span>
            <div className={styles.segmented}>
              {WORKOUT_LEVELS.map((level) => (
                <button key={level.id} type="button" className={draft.level === level.id ? styles.segmentActive : ''} onClick={() => setDraft((current) => ({ ...current, level: level.id }))} aria-pressed={draft.level === level.id}>
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.equipmentBlock}>
            <span className={styles.settingName}>Attrezzatura</span>
            <div className={styles.equipmentOptions}>
              {WORKOUT_EQUIPMENT.map((equipment) => (
                <button key={equipment.id} type="button" className={draft.equipment.includes(equipment.id) ? styles.segmentActive : ''} onClick={() => toggleEquipment(equipment.id)} aria-pressed={draft.equipment.includes(equipment.id)}>
                  {equipment.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.exerciseSectionHead}>
          <h3>Esercizi — {draft.exercises.length}</h3>
          <small>Usa le frecce per cambiare ordine</small>
        </div>
        {draft.exercises.length ? (
          <div className={styles.exerciseList}>{draft.exercises.map(renderExerciseCard)}</div>
        ) : (
          <div className={styles.exerciseEmpty}>
            <span><Dumbbell size={20} aria-hidden="true" /></span>
            <div><strong>Nessun esercizio</strong><small>Apri la libreria e componi la tua routine.</small></div>
          </div>
        )}
        {draftError === 'exercises' ? <p className={styles.exerciseError} role="alert">Aggiungi almeno un esercizio prima di salvare.</p> : null}
        <button type="button" className={styles.addExerciseButton} onClick={openExercisePicker}>
          <Plus size={19} aria-hidden="true" /> Aggiungi esercizio
        </button>

        <div className={styles.builderActions}>
          <Button type="button" variant="secondary" icon={Eye} onClick={previewDraft}>Anteprima</Button>
          <Button type="button" icon={Save} onClick={saveDraft}>Salva scheda</Button>
        </div>
      </div>
    );
  }

  function renderPreviewStep() {
    const levelLabel = WORKOUT_LEVELS.find((level) => level.id === draft.level)?.label || draft.level;
    return (
      <div className={styles.previewStep}>
        <div className={styles.previewHero}>
          <div><p className={styles.eyebrow}>Anteprima scheda</p><h2>{draft.title}</h2><p>{currentSport.label} · {draft.type}</p></div>
          <span className={styles.previewIcon}><Dumbbell size={25} aria-hidden="true" /></span>
        </div>
        <div className={styles.previewStats}>
          <div><Clock3 size={18} /><strong>{draft.duration} min</strong><span>Durata</span></div>
          <div><Dumbbell size={18} /><strong>{draft.exercises.length}</strong><span>Esercizi</span></div>
          <div><Sparkles size={18} /><strong>{levelLabel}</strong><span>Livello</span></div>
        </div>
        <div className={styles.previewExerciseList}>
          {draft.exercises.map((exercise, index) => (
            <article key={exercise.instanceId}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{exercise.name}</strong><small>{exercise.sets} × {exercise.reps} · RIR {exercise.rir}{exercise.weight > 0 ? ` · ${exercise.weight} kg` : ''}</small></div>
              <em>{getCategoryLabel(exercise.category)}</em>
            </article>
          ))}
        </div>
        <div className={styles.twoActions}>
          <Button type="button" variant="secondary" onClick={() => setStep(3)}>Modifica</Button>
          <Button type="button" icon={Save} onClick={saveDraft}>Salva scheda</Button>
        </div>
      </div>
    );
  }

  function renderSyncBadge() {
    const state = {
      syncing: { label: 'Sincronizzazione…', Icon: RefreshCw, className: styles.syncBadgeSyncing },
      synced: { label: 'Sincronizzata', Icon: Cloud, className: styles.syncBadgeSynced },
      offline: { label: 'Sync in attesa', Icon: CloudOff, className: styles.syncBadgeOffline },
      local: { label: 'Solo dispositivo', Icon: CloudOff, className: styles.syncBadgeLocal }
    }[syncState];
    const SyncIcon = state.Icon;
    return (
      <span className={`${styles.syncBadge} ${state.className}`} aria-live="polite">
        <SyncIcon size={15} aria-hidden="true" /> {state.label}
      </span>
    );
  }

  if (screen === 'library') {
    return (
      <section className={styles.page}>
        <header className={styles.libraryHero}>
          <div className={styles.libraryTitle}>
            <p className={styles.eyebrow}>Allenamento personale</p>
            <h1>Schede personali</h1>
          </div>
          <span className={styles.planCount}><strong>{plans.length}</strong><small>schede</small></span>
          <div className={styles.libraryStatus}>
            {renderSyncBadge()}
            <span><Layers3 size={14} /> {totalExercises} esercizi salvati</span>
          </div>
        </header>
        <section className={styles.libraryTools} aria-label="Gestione schede">
          <Button type="button" icon={Plus} onClick={startNewPlan}>Nuova scheda</Button>
          {plans.length ? (
            <label className={styles.librarySearch}>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Cerca scheda o esercizio"
                aria-label="Cerca tra le schede personali"
              />
              {libraryQuery ? <button type="button" onClick={() => setLibraryQuery('')} aria-label="Cancella ricerca"><X size={15} /></button> : null}
            </label>
          ) : null}
        </section>
        {plans.length && availableSports.length > 1 ? (
          <nav className={styles.sportFilters} aria-label="Filtra schede per sport">
            <span><Filter size={14} /> Filtra</span>
            <button type="button" className={librarySport === 'all' ? styles.sportFilterActive : ''} onClick={() => setLibrarySport('all')} aria-pressed={librarySport === 'all'}>Tutte</button>
            {availableSports.map((sport) => (
              <button key={sport.id} type="button" className={librarySport === sport.id ? styles.sportFilterActive : ''} onClick={() => setLibrarySport(sport.id)} aria-pressed={librarySport === sport.id}>
                {sport.emoji} {sport.label}
              </button>
            ))}
          </nav>
        ) : null}
        {plans.length === 0 ? (
          <div className={styles.emptyState}>
            <span><Dumbbell size={28} aria-hidden="true" /></span>
            <h2>La tua prima scheda parte da qui</h2>
            <p>Configura esercizi, serie, ripetizioni, carichi, RIR e recuperi.</p>
            <Button type="button" icon={Plus} onClick={startNewPlan}>Crea scheda personale</Button>
          </div>
        ) : visiblePlans.length ? (
          <section className={styles.librarySection}>
            <div className={styles.librarySectionHead}>
              <div><small>LA TUA LIBRERIA</small><h2>Routine salvate</h2></div>
              <span>{visiblePlans.length}</span>
            </div>
          <div className={styles.savedGrid}>
            {visiblePlans.map((plan) => {
              const sport = getSportById(plan.sportId);
              const level = WORKOUT_LEVELS.find((item) => item.id === plan.level)?.label || plan.level;
              return (
                <article key={plan.id} className={styles.savedCard}>
                  <div className={styles.savedCardHead}>
                    <span>{sport.emoji}</span>
                    <div><small>{sport.label} · {plan.type}</small><h2>{plan.title}</h2><p>{formatPlanDate(plan.updatedAt || plan.createdAt)}</p></div>
                  </div>
                  <div className={styles.savedStats}>
                    <span><Clock3 size={15} /> {plan.duration} min</span>
                    <span><Dumbbell size={15} /> {plan.exercises.length} esercizi</span>
                    <span>{level}</span>
                  </div>
                  <p className={styles.exercisePreview}>
                    {plan.exercises.slice(0, 3).map((exercise) => exercise.name).join(' · ')}
                    {plan.exercises.length > 3 ? ` · +${plan.exercises.length - 3}` : ''}
                  </p>
                  <div className={styles.savedActions}>
                    <Button type="button" size="sm" icon={Pencil} onClick={() => openPlan(plan)}>Apri e modifica</Button>
                    <button type="button" className={styles.planDeleteButton} onClick={() => setPlanPendingDelete(plan)} aria-label={`Elimina la scheda ${plan.title}`}>
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          </section>
        ) : (
          <div className={styles.filteredEmpty}>
            <Search size={24} />
            <h2>Nessuna scheda trovata</h2>
            <p>Prova un altro nome oppure mostra tutte le discipline.</p>
            <button type="button" onClick={() => { setLibraryQuery(''); setLibrarySport('all'); }}>Azzera filtri</button>
          </div>
        )}
        {planPendingDelete ? (
          <div
            className={styles.deleteConfirmOverlay}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-plan-title"
            aria-describedby="delete-plan-description"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPlanPendingDelete(null);
            }}
          >
            <div className={styles.deleteConfirmDialog}>
              <span className={styles.deleteConfirmIcon}><Trash2 size={22} aria-hidden="true" /></span>
              <div>
                <p className={styles.eyebrow}>Elimina scheda</p>
                <h2 id="delete-plan-title">Sei sicuro?</h2>
                <p id="delete-plan-description">
                  Vuoi eliminare “{planPendingDelete.title}”? L’operazione è definitiva e verrà sincronizzata sui tuoi dispositivi.
                </p>
              </div>
              <div className={styles.deleteConfirmActions}>
                <button type="button" className={styles.deleteCancelButton} onClick={() => setPlanPendingDelete(null)} autoFocus>Annulla</button>
                <button
                  type="button"
                  className={styles.deleteConfirmButton}
                  onClick={() => {
                    const planId = planPendingDelete.id;
                    setPlanPendingDelete(null);
                    deletePlan(planId);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Elimina
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className={styles.editorPage}>
      <header className={styles.editorHeader}>
        <button type="button" className={styles.closeEditorButton} onClick={closeEditor} aria-label="Chiudi editor scheda"><X size={20} aria-hidden="true" /></button>
        <div className={styles.editorBrand}>
          <BrandLogo className={styles.editorBrandLogo} decorative />
          <div><strong>{draft.id ? 'MODIFICA SCHEDA' : 'NUOVA SCHEDA'}</strong><small>{hasUnsavedChanges ? 'Modifiche non salvate' : 'Tutto salvato'}</small></div>
        </div>
      </header>
      {renderProgress()}
      <div className={styles.editorContent}>
        {step === 1 ? renderSportStep() : null}
        {step === 2 ? renderTypeStep() : null}
        {step === 3 ? renderBuilderStep() : null}
        {step === 4 ? renderPreviewStep() : null}
      </div>

      {pickerOpen ? (
        <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true" aria-label="Aggiungi esercizio">
          <div className={styles.fullscreenPanel}>
            <header className={styles.modalHeader}>
              <div><p className={styles.eyebrow}>Libreria esercizi</p><h2>Aggiungi esercizi</h2></div>
              <div className={styles.modalHeaderActions}>
                <button type="button" className={styles.customExerciseButton} onClick={openCustomExerciseCreator}><Plus size={15} aria-hidden="true" /> Crea</button>
                <button type="button" className={styles.modalCloseText} onClick={closeExercisePicker}>Annulla</button>
              </div>
            </header>
            <label className={styles.searchBox}><Search size={19} aria-hidden="true" /><input value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Cerca esercizio o sinonimo" autoFocus />{pickerQuery ? <button type="button" onClick={() => setPickerQuery('')} aria-label="Cancella ricerca"><X size={16} /></button> : null}</label>
            <div className={styles.categoryScroller}>
              {ALL_CATEGORIES.map((category) => (
                <button key={category.id} type="button" className={pickerCategory === category.id ? styles.categoryActive : ''} onClick={() => setPickerCategory(category.id)} aria-pressed={pickerCategory === category.id}>{category.label}</button>
              ))}
            </div>
            <div className={styles.equipmentFilterRow}>
              <span>Attrezzatura</span>
              <div className={styles.equipmentScroller}>
                {ALL_EXERCISE_EQUIPMENT.map((equipment) => (
                  <button key={equipment.id} type="button" className={pickerEquipment === equipment.id ? styles.equipmentActive : ''} onClick={() => setPickerEquipment(equipment.id)} aria-pressed={pickerEquipment === equipment.id}>{equipment.label}</button>
                ))}
              </div>
              <strong aria-live="polite">{filteredExercises.length}</strong>
            </div>
            <div className={styles.catalogList}>
              {filteredExercises.length ? filteredExercises.map((exercise) => {
                const added = addedExerciseIds.has(exercise.id);
                const selected = pendingExerciseIds.includes(exercise.id);
                const favorite = favoriteExerciseIdSet.has(exercise.id);
                const latest = latestPrescriptions.get(exercise.id);
                return (
                  <article
                    key={exercise.id}
                    className={styles.catalogRow}
                    data-selected={selected ? 'true' : 'false'}
                  >
                    <button
                      type="button"
                      className={styles.catalogChoice}
                      data-selected={selected ? 'true' : 'false'}
                      onClick={() => togglePickerExercise(exercise)}
                      aria-label={added ? `${exercise.name} già presente` : selected ? `Rimuovi ${exercise.name} dalla selezione` : `Seleziona ${exercise.name}`}
                      aria-pressed={selected}
                      disabled={added}
                    >
                      <div>
                        <strong>{exercise.shortName || exercise.name}</strong>
                        <small>{exercise.custom ? 'Personale · ' : ''}{getCategoryLabel(exercise.category)} · {exercise.equipment}</small>
                        {latest ? (
                          <em className={styles.latestPrescription}>
                            Ultimo: {latest.weight > 0 ? `${latest.weight} kg · ` : ''}{latest.reps} rip. · RIR {latest.rir}
                          </em>
                        ) : null}
                      </div>
                      <span className={added || selected ? styles.catalogAdded : ''}>
                        {added || selected ? <Check size={20} /> : <Plus size={20} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.favoriteExerciseButton} ${favorite ? styles.favoriteExerciseButtonActive : ''}`}
                      onClick={() => toggleFavoriteExercise(exercise.id)}
                      aria-label={favorite ? `Rimuovi ${exercise.name} dai preferiti` : `Aggiungi ${exercise.name} ai preferiti`}
                      aria-pressed={favorite}
                    >
                      <Star size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  </article>
                );
              }) : (
                <div className={styles.noResults}>
                  <strong>Nessun esercizio trovato</strong>
                  <span>Prova un altro termine oppure azzera i filtri.</span>
                  <button type="button" onClick={() => { setPickerQuery(''); setPickerCategory('all'); setPickerEquipment('all'); }}>Azzera filtri</button>
                </div>
              )}
            </div>
            <div className={styles.pickerFooter}>
              <span aria-live="polite">
                <strong>{pendingExerciseIds.length}</strong>
                {pendingExerciseIds.length === 1 ? ' esercizio selezionato' : ' esercizi selezionati'}
              </span>
              <Button
                type="button"
                fullWidth
                icon={Check}
                disabled={!pendingExerciseIds.length}
                onClick={confirmExerciseSelection}
              >
                Salva e torna alla scheda
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {customExerciseOpen ? (
        <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true" aria-label="Crea esercizio personale">
          <div className={`${styles.fullscreenPanel} ${styles.customExercisePanel}`}>
            <header className={styles.modalHeader}>
              <div><p className={styles.eyebrow}>Esercizio personale</p><h2>Crea esercizio</h2></div>
              <button type="button" onClick={() => setCustomExerciseOpen(false)} aria-label="Chiudi creazione esercizio"><X size={21} /></button>
            </header>
            <p className={styles.customExerciseLead}>Aggiungilo alla tua libreria e riutilizzalo in tutte le schede.</p>
            <label className={styles.fieldLabel}><span>Nome esercizio</span><input value={customExerciseDraft.name} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Es. Pressa orizzontale" autoFocus /></label>
            <div className={styles.editGrid}>
              <label className={styles.fieldLabel}>
                <span>Gruppo muscolare</span>
                <select value={customExerciseDraft.category} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, category: event.target.value }))}>
                  {EXERCISE_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </label>
              <label className={styles.fieldLabel}>
                <span>Attrezzatura</span>
                <select value={customExerciseDraft.equipment} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, equipment: event.target.value }))}>
                  {EXERCISE_EQUIPMENT_FILTERS.map((equipment) => <option key={equipment} value={equipment}>{equipment}</option>)}
                </select>
              </label>
              <label className={styles.fieldLabel}><span>Serie</span><input type="number" inputMode="numeric" min="1" max="20" value={customExerciseDraft.sets} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, sets: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Ripetizioni</span><input value={customExerciseDraft.reps} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, reps: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Carico · kg</span><input type="number" inputMode="decimal" min="0" step="0.5" value={customExerciseDraft.weight} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, weight: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>RIR · 0–5</span><input type="number" inputMode="numeric" min="0" max="5" value={customExerciseDraft.rir} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, rir: event.target.value }))} /></label>
              <label className={`${styles.fieldLabel} ${styles.fullField}`}><span>Recupero · secondi</span><input type="number" inputMode="numeric" min="0" max="900" step="15" value={customExerciseDraft.recovery} onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, recovery: event.target.value }))} /></label>
            </div>
            <Button type="button" fullWidth icon={Plus} onClick={saveCustomExercise}>Crea e seleziona</Button>
          </div>
        </div>
      ) : null}

      {editingExercise ? (
        <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true" aria-label="Modifica esercizio">
          <div ref={exerciseEditorPanelRef} className={`${styles.fullscreenPanel} ${styles.exerciseEditorPanel}`}>
            <header className={styles.modalHeader}><div><p className={styles.eyebrow}>Esercizio {editingExercise.index + 1}</p><h2>Modifica esercizio</h2></div><button type="button" onClick={() => setEditingExercise(null)} aria-label="Chiudi modifica esercizio" autoFocus><X size={22} /></button></header>
            <div className={styles.editContext}>
              <span>{getCategoryLabel(editingExercise.category)}</span>
              <span>{editingExercise.equipment}</span>
            </div>
            <label className={styles.fieldLabel}><span>Nome</span><input value={editingExercise.name} onChange={(event) => setEditingExercise((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className={styles.editGrid}>
              <label className={styles.fieldLabel}><span>Serie</span><input type="number" inputMode="numeric" min="1" max="20" value={editingExercise.sets} onChange={(event) => setEditingExercise((current) => ({ ...current, sets: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Ripetizioni</span><input inputMode="numeric" value={editingExercise.reps} onChange={(event) => setEditingExercise((current) => ({ ...current, reps: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Carico · kg</span><input type="number" inputMode="decimal" min="0" step="0.5" value={editingExercise.weight} onChange={(event) => setEditingExercise((current) => ({ ...current, weight: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>RIR · 0–5</span><input type="number" inputMode="numeric" min="0" max="5" value={editingExercise.rir} onChange={(event) => setEditingExercise((current) => ({ ...current, rir: event.target.value }))} /></label>
              <label className={`${styles.fieldLabel} ${styles.fullField}`}><span>Recupero · secondi</span><input type="number" inputMode="numeric" min="0" step="15" value={editingExercise.recovery} onChange={(event) => setEditingExercise((current) => ({ ...current, recovery: event.target.value }))} /></label>
            </div>
            <div className={styles.recoveryPresets} aria-label="Scelte rapide recupero">
              {[60, 90, 120, 180].map((seconds) => (
                <button key={seconds} type="button" className={Number(editingExercise.recovery) === seconds ? styles.recoveryPresetActive : ''} onClick={() => setEditingExercise((current) => ({ ...current, recovery: seconds }))} aria-pressed={Number(editingExercise.recovery) === seconds}>
                  {seconds}s
                </button>
              ))}
            </div>
            <p className={styles.editHelper}><strong>RIR</strong> indica quante ripetizioni avresti ancora in riserva: 0 significa cedimento.</p>
            <Button type="button" fullWidth icon={Check} onClick={saveExerciseEditor}>Salva modifiche</Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={editorClosePending}
        title="Modifiche non salvate"
        onClose={() => setEditorClosePending(false)}
        onConfirm={completeEditorClose}
        closeText="Continua a modificare"
        confirmText="Esci senza salvare"
      >
        <p>Vuoi tornare alle tue schede senza salvare le modifiche?</p>
      </Modal>
    </section>
  );
}

export default MyPlansPage;
