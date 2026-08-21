import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Dumbbell,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import Button from '../../../components/Button';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import { getAuthSession } from '../../../services/authSession';
import { safeStorageGet, safeStorageSet } from '../../../utils/safeStorage';
import {
  EXERCISE_CATEGORIES,
  PERSONAL_EXERCISE_LIBRARY,
  STARTER_EXERCISE_IDS,
  WORKOUT_DURATIONS,
  WORKOUT_EQUIPMENT,
  WORKOUT_LEVELS,
  WORKOUT_SPORTS,
  getCategoryLabel,
  getSportById
} from '../data/personalWorkoutCatalog';
import {
  canSyncPersonalWorkoutPlans,
  deletePersonalWorkoutPlan,
  listPersonalWorkoutPlans,
  upsertPersonalWorkoutPlan
} from '../services/personalWorkoutPlansApi';
import styles from '../../../styles/pages/personalPlans.module.css';

const STORAGE_PREFIX = 'motrice_personal_workout_plans_v1';
const DELETED_STORAGE_SUFFIX = ':deleted';

function uniqueId(prefix = 'item') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function copyValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function exerciseFromCatalog(item) {
  return {
    instanceId: uniqueId('exercise'),
    catalogId: item.id,
    name: item.name,
    category: item.category,
    equipment: item.equipment,
    sets: item.sets,
    reps: item.reps,
    weight: item.weight,
    rir: item.rir,
    recovery: item.recovery
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

function loadPersonalPlans(storageKey) {
  try {
    const value = JSON.parse(safeStorageGet(storageKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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

function MyPlansPage() {
  const { showToast } = useToast();
  const storageKey = useMemo(() => {
    const session = getAuthSession();
    const identity = session.authUserId || session.userId || session.email || 'guest';
    return `${STORAGE_PREFIX}:${identity}`;
  }, []);
  const initialPlans = useMemo(() => loadPersonalPlans(storageKey), [storageKey]);
  const remoteSyncEnabled = useMemo(() => canSyncPersonalWorkoutPlans(), []);

  const [plans, setPlans] = useState(initialPlans);
  const [screen, setScreen] = useState(initialPlans.length || remoteSyncEnabled ? 'library' : 'editor');
  const [step, setStep] = useState(initialPlans.length ? 1 : 3);
  const [draft, setDraft] = useState(createStarterDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState('petto');
  const [pickerQuery, setPickerQuery] = useState('');
  const [editingExercise, setEditingExercise] = useState(null);
  const [draggedExerciseIndex, setDraggedExerciseIndex] = useState(null);
  const [syncState, setSyncState] = useState(remoteSyncEnabled ? 'syncing' : 'local');

  usePageMeta({
    title: 'Schede personali | Motrice',
    description: 'Crea, modifica e salva le tue schede di allenamento personali.'
  });

  const currentSport = getSportById(draft.sportId);
  const addedExerciseIds = useMemo(
    () => new Set(draft.exercises.map((exercise) => exercise.catalogId)),
    [draft.exercises]
  );
  const filteredExercises = useMemo(() => {
    const query = normalizeSearch(pickerQuery);
    return PERSONAL_EXERCISE_LIBRARY.filter((exercise) => {
      if (exercise.category !== pickerCategory) return false;
      if (!query) return true;
      return normalizeSearch(`${exercise.name} ${exercise.equipment} ${getCategoryLabel(exercise.category)}`).includes(query);
    });
  }, [pickerCategory, pickerQuery]);

  useEffect(() => {
    if (!remoteSyncEnabled) return undefined;
    let active = true;

    async function synchronizePlans() {
      setSyncState('syncing');
      try {
        const pendingDeletions = loadPendingDeletions(storageKey);
        for (const planId of pendingDeletions) {
          await deletePersonalWorkoutPlan(planId);
        }
        if (pendingDeletions.length) savePendingDeletions(storageKey, []);

        const localPlans = loadPersonalPlans(storageKey);
        const remotePlans = await listPersonalWorkoutPlans();
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
        setSyncState('synced');
        if (!nextPlans.length && !initialPlans.length) {
          setScreen('editor');
          setStep(3);
        }
      } catch {
        if (!active) return;
        setSyncState('offline');
        if (!initialPlans.length) {
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
    setDraft(createStarterDraft());
    setStep(1);
    setScreen('editor');
  }

  function openPlan(plan) {
    setDraft(copyValue(plan));
    setStep(3);
    setScreen('editor');
  }

  function closeEditor() {
    setScreen('library');
    setStep(1);
    setPickerOpen(false);
    setEditingExercise(null);
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
      showToast('Inserisci un nome per la scheda', 'error');
      return false;
    }
    if (!draft.exercises.length) {
      showToast('Aggiungi almeno un esercizio', 'error');
      return false;
    }
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
    setScreen('library');
    setStep(1);
    await syncSavedPlan(savedPlan, existingIndex >= 0 ? 'Scheda aggiornata' : 'Scheda personale salvata');
  }

  async function duplicatePlan(plan) {
    const now = new Date().toISOString();
    const duplicate = {
      ...copyValue(plan),
      id: uniqueId('plan'),
      title: `${plan.title} - Copia`,
      exercises: plan.exercises.map((exercise) => ({ ...exercise, instanceId: uniqueId('exercise') })),
      createdAt: now,
      updatedAt: now
    };
    persistPlans([duplicate, ...plans]);
    await syncSavedPlan(duplicate, 'Scheda duplicata');
  }

  async function deletePlan(planId) {
    if (!window.confirm('Eliminare definitivamente questa scheda personale?')) return;
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

  function addExercise(item) {
    if (addedExerciseIds.has(item.id)) {
      showToast('Esercizio già presente nella scheda', 'error');
      return;
    }
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, exerciseFromCatalog(item)]
    }));
    showToast(`${item.name} aggiunto`, 'success');
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
      { id: 3, label: 'Scheda' },
      { id: 4, label: 'Salva' }
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
            >
              <Dumbbell size={22} aria-hidden="true" />
              <strong>{type}</strong>
              {draft.type === type ? <Check size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <div className={styles.twoActions}>
          <Button type="button" variant="secondary" onClick={() => setStep(1)}>Indietro</Button>
          <Button type="button" onClick={() => setStep(3)}>Crea la scheda</Button>
        </div>
      </div>
    );
  }

  function renderExerciseCard(exercise, index) {
    const categoryLabel = getCategoryLabel(exercise.category);
    return (
      <article
        key={exercise.instanceId}
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
            <button type="button" onClick={() => openExerciseEditor(exercise, index)}><Pencil size={14} /> Mod</button>
            <button type="button" onClick={() => duplicateExercise(index)}><Copy size={14} /> Dup</button>
            <button type="button" onClick={() => removeExercise(index)} aria-label={`Elimina ${exercise.name}`}><Trash2 size={14} /></button>
          </div>
        </div>
      </article>
    );
  }

  function renderBuilderStep() {
    return (
      <div className={styles.builderStep}>
        <div className={styles.builderTopbar}>
          <button type="button" className={styles.circleButton} onClick={() => setStep(2)} aria-label="Torna al tipo di allenamento">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <Button type="button" size="sm" variant="secondary" icon={Eye} onClick={previewDraft}>Anteprima</Button>
        </div>

        <h2>Crea la tua scheda</h2>
        <div className={styles.contextBadges}>
          <span>Sport: {currentSport.label}</span>
          <span>{draft.type}</span>
        </div>

        <label className={styles.fieldLabel}>
          <span>Nome della scheda</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, 70) }))}
            placeholder="Es. Push Day - Petto e Tricipiti"
          />
        </label>

        <section className={styles.settingsSection}>
          <h3>Impostazioni</h3>
          <div className={styles.settingRow}>
            <span className={styles.settingName}><Clock3 size={18} /> Durata</span>
            <div className={styles.segmented}>
              {WORKOUT_DURATIONS.map((duration) => (
                <button key={duration} type="button" className={draft.duration === duration ? styles.segmentActive : ''} onClick={() => setDraft((current) => ({ ...current, duration }))}>
                  {duration}m
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingName}>Livello</span>
            <div className={styles.segmented}>
              {WORKOUT_LEVELS.map((level) => (
                <button key={level.id} type="button" className={draft.level === level.id ? styles.segmentActive : ''} onClick={() => setDraft((current) => ({ ...current, level: level.id }))}>
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.equipmentBlock}>
            <span className={styles.settingName}>Attrezzatura</span>
            <div className={styles.equipmentOptions}>
              {WORKOUT_EQUIPMENT.map((equipment) => (
                <button key={equipment.id} type="button" className={draft.equipment.includes(equipment.id) ? styles.segmentActive : ''} onClick={() => toggleEquipment(equipment.id)}>
                  {equipment.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.exerciseSectionHead}>
          <h3>Esercizi — {draft.exercises.length}</h3>
          <small>tieni premuto o usa le frecce per riordinare</small>
        </div>
        <div className={styles.exerciseList}>{draft.exercises.map(renderExerciseCard)}</div>
        <button type="button" className={styles.addExerciseButton} onClick={() => setPickerOpen(true)}>
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
          <div><p className={styles.eyebrow}>Allenamento personale</p><h1>Schede personali</h1><p>Crea routine su misura, organizzale e portale sempre con te.</p></div>
          <div className={styles.libraryActions}>
            {renderSyncBadge()}
            <Button type="button" icon={Plus} onClick={startNewPlan}>Nuova scheda</Button>
          </div>
        </header>
        {plans.length === 0 ? (
          <div className={styles.emptyState}>
            <span><Dumbbell size={28} aria-hidden="true" /></span>
            <h2>La tua prima scheda parte da qui</h2>
            <p>Configura esercizi, serie, ripetizioni, carichi, RIR e recuperi.</p>
            <Button type="button" icon={Plus} onClick={startNewPlan}>Crea scheda personale</Button>
          </div>
        ) : (
          <div className={styles.savedGrid}>
            {plans.map((plan) => {
              const sport = getSportById(plan.sportId);
              const level = WORKOUT_LEVELS.find((item) => item.id === plan.level)?.label || plan.level;
              return (
                <article key={plan.id} className={styles.savedCard}>
                  <div className={styles.savedCardHead}>
                    <span>{sport.emoji}</span>
                    <div><small>{sport.label} · {plan.type}</small><h2>{plan.title}</h2></div>
                  </div>
                  <div className={styles.savedStats}>
                    <span><Clock3 size={15} /> {plan.duration} min</span>
                    <span><Dumbbell size={15} /> {plan.exercises.length} esercizi</span>
                    <span>{level}</span>
                  </div>
                  <ul>
                    {plan.exercises.slice(0, 3).map((exercise) => <li key={exercise.instanceId}>{exercise.name}</li>)}
                    {plan.exercises.length > 3 ? <li>+{plan.exercises.length - 3} altri</li> : null}
                  </ul>
                  <div className={styles.savedActions}>
                    <Button type="button" size="sm" icon={Pencil} onClick={() => openPlan(plan)}>Modifica</Button>
                    <button type="button" onClick={() => duplicatePlan(plan)} aria-label={`Duplica ${plan.title}`}><Copy size={17} /></button>
                    <button type="button" onClick={() => deletePlan(plan.id)} aria-label={`Elimina ${plan.title}`}><Trash2 size={17} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={styles.editorPage}>
      <header className={styles.editorHeader}>
        <button type="button" className={styles.closeEditorButton} onClick={closeEditor} aria-label="Chiudi editor scheda"><X size={20} aria-hidden="true" /></button>
        <strong>MOTRICE</strong>
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
            <header className={styles.modalHeader}><h2>Aggiungi esercizio</h2><button type="button" onClick={() => setPickerOpen(false)} aria-label="Chiudi catalogo esercizi"><X size={22} /></button></header>
            <label className={styles.searchBox}><Search size={19} aria-hidden="true" /><input value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Cerca esercizio..." autoFocus /></label>
            <div className={styles.categoryScroller}>
              {EXERCISE_CATEGORIES.map((category) => (
                <button key={category.id} type="button" className={pickerCategory === category.id ? styles.categoryActive : ''} onClick={() => setPickerCategory(category.id)}>{category.label}</button>
              ))}
            </div>
            <div className={styles.catalogList}>
              {filteredExercises.length ? filteredExercises.map((exercise) => {
                const added = addedExerciseIds.has(exercise.id);
                return (
                  <article key={exercise.id}>
                    <div><strong>{exercise.shortName || exercise.name}</strong><small>{getCategoryLabel(exercise.category)} · {exercise.equipment}</small></div>
                    <button type="button" className={added ? styles.catalogAdded : ''} onClick={() => addExercise(exercise)} aria-label={`Aggiungi ${exercise.name}`}>{added ? <Check size={20} /> : <Plus size={20} />}</button>
                  </article>
                );
              }) : <p className={styles.noResults}>Nessun esercizio trovato</p>}
            </div>
            <Button type="button" fullWidth variant="secondary" onClick={() => setPickerOpen(false)}>Fine</Button>
          </div>
        </div>
      ) : null}

      {editingExercise ? (
        <div className={styles.fullscreenOverlay} role="dialog" aria-modal="true" aria-label="Modifica esercizio">
          <div className={`${styles.fullscreenPanel} ${styles.exerciseEditorPanel}`}>
            <header className={styles.modalHeader}><div><p className={styles.eyebrow}>Esercizio {editingExercise.index + 1}</p><h2>Modifica esercizio</h2></div><button type="button" onClick={() => setEditingExercise(null)} aria-label="Chiudi modifica esercizio"><X size={22} /></button></header>
            <label className={styles.fieldLabel}><span>Nome</span><input value={editingExercise.name} onChange={(event) => setEditingExercise((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className={styles.editGrid}>
              <label className={styles.fieldLabel}><span>Serie</span><input type="number" min="1" max="20" value={editingExercise.sets} onChange={(event) => setEditingExercise((current) => ({ ...current, sets: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Ripetizioni</span><input value={editingExercise.reps} onChange={(event) => setEditingExercise((current) => ({ ...current, reps: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>Carico kg</span><input type="number" min="0" step="0.5" value={editingExercise.weight} onChange={(event) => setEditingExercise((current) => ({ ...current, weight: event.target.value }))} /></label>
              <label className={styles.fieldLabel}><span>RIR</span><input type="number" min="0" max="5" value={editingExercise.rir} onChange={(event) => setEditingExercise((current) => ({ ...current, rir: event.target.value }))} /></label>
              <label className={`${styles.fieldLabel} ${styles.fullField}`}><span>Recupero secondi</span><input type="number" min="0" step="15" value={editingExercise.recovery} onChange={(event) => setEditingExercise((current) => ({ ...current, recovery: event.target.value }))} /></label>
            </div>
            <Button type="button" fullWidth icon={Check} onClick={saveExerciseEditor}>Salva modifiche</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default MyPlansPage;
