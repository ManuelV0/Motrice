import { useMemo, useState } from 'react';
import { CheckCircle2, LockKeyhole, PlayCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import { usePageMeta } from '../hooks/usePageMeta';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';
import styles from '../styles/pages/adminTutorial.module.css';

const STORAGE_KEY = 'motrice_admin_tutorial_v1';

const ADMIN_FUNCTIONS = [
  {
    id: 'coach-review',
    title: 'Review candidature coach',
    description: 'Apri il pannello candidature coach e verifica certificazioni, motivi rifiuto e invio mail.',
    to: '/admin/coach-applications'
  },
  {
    id: 'partner-review',
    title: 'Review candidature convenzioni',
    description: 'Gestisci approvazioni partner, note interne e stati candidatura.',
    to: '/admin/convenzioni-applications'
  },
  {
    id: 'voucher-redeem',
    title: 'Verifica e riscatto voucher',
    description: 'Controlla validita voucher convenzioni e registra riscatti manuali.',
    to: '/admin/convenzioni-applications'
  },
  {
    id: 'contract-generation',
    title: 'Generatore contratti',
    description: 'Compila accordi, registra hash e conserva ricevute amministrative.',
    to: '/admin/convenzioni-generator'
  }
];

const ADMIN_STEPS = [
  {
    id: 'security-check',
    title: 'Controllo sicurezza iniziale',
    description: 'Verifica che la sessione sia admin e che nessuno usi il browser condiviso.',
    to: '/admin/tutorial'
  },
  {
    id: 'coach-queue',
    title: 'Pulizia coda coach',
    description: 'Apri candidature coach pending, valida certificato e completa una decisione.',
    to: '/admin/coach-applications'
  },
  {
    id: 'partner-queue',
    title: 'Pulizia coda convenzioni',
    description: 'Apri candidature convenzioni e verifica documentazione prima dell approvazione.',
    to: '/admin/convenzioni-applications'
  },
  {
    id: 'voucher-ops',
    title: 'Controllo voucher',
    description: 'Esegui una verifica voucher manuale per confermare il flusso operativo.',
    to: '/admin/convenzioni-applications'
  },
  {
    id: 'contract-audit',
    title: 'Audit contratti',
    description: 'Apri generatore contratti e controlla coerenza metadati firma/hash.',
    to: '/admin/convenzioni-generator'
  },
  {
    id: 'report-close',
    title: 'Chiusura turno admin',
    description: 'Aggiorna note e conferma completamento checklist di giornata.',
    to: '/admin/tutorial'
  }
];

const DEFAULT_STATE = {
  status: 'idle',
  phase: 'overview',
  startedAt: null,
  completedAt: null,
  currentStepIndex: -1,
  completedStepIds: []
};

function normalizeState(input) {
  const state = input && typeof input === 'object' ? input : {};
  const completedStepIds = Array.isArray(state.completedStepIds)
    ? state.completedStepIds.filter((id) => ADMIN_STEPS.some((step) => step.id === id))
    : [];
  const maxIndex = Math.max(-1, ADMIN_STEPS.length - 1);
  const currentStepIndex = Number.isInteger(state.currentStepIndex)
    ? Math.max(-1, Math.min(maxIndex, state.currentStepIndex))
    : -1;

  return {
    ...DEFAULT_STATE,
    ...state,
    currentStepIndex,
    completedStepIds
  };
}

function getState() {
  const raw = safeStorageGet(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function setState(nextState) {
  const normalized = normalizeState(nextState);
  safeStorageSet(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function formatDateTime(value) {
  if (!value) return 'n/d';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/d';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function AdminTutorialPage() {
  const [state, setLocalState] = useState(() => getState());
  const completionPct = useMemo(() => Math.round((state.completedStepIds.length / ADMIN_STEPS.length) * 100), [state.completedStepIds.length]);
  const currentStep = ADMIN_STEPS[Math.max(0, state.currentStepIndex)] || null;

  usePageMeta({
    title: 'Admin Tutorial | Motrice',
    description: 'Tutorial operativo dedicato agli admin: review candidature, voucher, contratti e checklist di chiusura.'
  });

  function onStart() {
    setLocalState(
      setState({
        ...state,
        status: 'active',
        phase: 'inizia_tutorial',
        startedAt: new Date().toISOString(),
        completedAt: null,
        currentStepIndex: 0,
        completedStepIds: []
      })
    );
  }

  function onCompleteStep() {
    if (state.status !== 'active' || !currentStep) return;
    const nextIds = Array.from(new Set([...state.completedStepIds, currentStep.id]));
    const reachedEnd = state.currentStepIndex >= ADMIN_STEPS.length - 1;
    setLocalState(
      setState({
        ...state,
        completedStepIds: nextIds,
        currentStepIndex: reachedEnd ? state.currentStepIndex : state.currentStepIndex + 1,
        status: reachedEnd ? 'done' : 'active',
        phase: reachedEnd ? 'completed' : state.phase,
        completedAt: reachedEnd ? new Date().toISOString() : null
      })
    );
  }

  function onReset() {
    setLocalState(setState({ ...DEFAULT_STATE }));
  }

  return (
    <section className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <ShieldCheck size={15} aria-hidden="true" /> Admin Zone
        </p>
        <h1>Tutorial dedicato agli amministratori</h1>
        <p className="muted">
          Questo percorso resta dentro la sezione admin e spiega flusso operativo, priorita e chiusura turno.
        </p>
        <div className={styles.actions}>
          <Button type="button" icon={PlayCircle} onClick={onStart}>
            Inizia tutorial admin
          </Button>
          <Button type="button" variant="secondary" icon={RotateCcw} onClick={onReset}>
            Reset
          </Button>
        </div>
      </Card>

      <Card className={styles.section}>
        <h2>Funzioni admin disponibili</h2>
        <div className={styles.grid}>
          {ADMIN_FUNCTIONS.map((item) => (
            <article key={item.id} className={styles.item}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link to={item.to} className={styles.inlineLink}>
                Apri sezione
              </Link>
            </article>
          ))}
        </div>
      </Card>

      <Card className={styles.section}>
        <div className={styles.progressHead}>
          <div>
            <h2>Checklist operativa admin</h2>
            <p className="muted">
              Stato: <strong>{state.status}</strong> | Fase: <strong>{state.phase}</strong>
            </p>
          </div>
          <p className={styles.progress}>{completionPct}%</p>
        </div>
        <p className="muted">
          Inizio: {formatDateTime(state.startedAt)} | Fine: {formatDateTime(state.completedAt)}
        </p>

        {currentStep && state.status === 'active' ? (
          <article className={styles.current}>
            <p className={styles.currentLabel}>Step corrente</p>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.description}</p>
            <div className={styles.actions}>
              <Link to={currentStep.to} className={styles.stepLink}>
                <LockKeyhole size={14} aria-hidden="true" /> Vai alla sezione
              </Link>
              <Button type="button" icon={CheckCircle2} onClick={onCompleteStep}>
                Step completato
              </Button>
            </div>
          </article>
        ) : null}

        <div className={styles.list}>
          {ADMIN_STEPS.map((step, index) => {
            const isDone = state.completedStepIds.includes(step.id);
            const isCurrent = state.status === 'active' && index === state.currentStepIndex;
            return (
              <article key={step.id} className={`${styles.step} ${isDone ? styles.stepDone : ''} ${isCurrent ? styles.stepCurrent : ''}`}>
                <span className={styles.badge}>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <Link to={step.to} className={styles.inlineLink}>
                    Apri
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

export default AdminTutorialPage;
