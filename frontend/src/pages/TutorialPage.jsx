import { BookOpenCheck, CheckCircle2, Compass, PlayCircle, RotateCcw, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  completeCurrentStep,
  getGoalCatalog,
  getPerspectiveCatalog,
  getRoleCatalog,
  getSiteFunctionsByRole,
  getTutorialState,
  getTutorialTrack,
  resetTutorial,
  setTutorialGoal,
  setTutorialRole,
  setTutorialPerspective,
  startTutorial
} from '../services/tutorialMode';
import styles from '../styles/pages/tutorial.module.css';

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

function TutorialPage() {
  const navigate = useNavigate();
  const [tutorialState, setTutorialState] = useState(() => getTutorialState());
  const [guideActive, setGuideActive] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [guideLayout, setGuideLayout] = useState(null);
  const [autoLaunchGuide, setAutoLaunchGuide] = useState(false);
  const roles = useMemo(() => getRoleCatalog(), []);
  const selectedRole = tutorialState.selectedRole;
  const selectedPerspective = tutorialState.selectedPerspective;
  const siteFunctions = useMemo(() => getSiteFunctionsByRole(selectedRole), [selectedRole]);
  const perspectives = useMemo(() => getPerspectiveCatalog(selectedRole), [selectedRole]);
  const goals = useMemo(() => getGoalCatalog(selectedRole), [selectedRole]);
  const perspectiveMeta = perspectives.find((item) => item.id === selectedPerspective) || null;
  const goalMeta = goals.find((item) => item.id === tutorialState.selectedGoal) || null;
  const tutorialTrack = useMemo(
    () => getTutorialTrack(selectedRole, selectedPerspective),
    [selectedRole, selectedPerspective]
  );
  const perspectiveStartRoute = useMemo(() => {
    const byPerspective = tutorialTrack.find((step) => String(step?.perspective || '') === String(selectedPerspective || ''));
    return String(byPerspective?.to || tutorialTrack[0]?.to || '');
  }, [selectedPerspective, tutorialTrack]);
  const roleGridRef = useRef(null);
  const perspectiveRef = useRef(null);
  const startActionsRef = useRef(null);
  const functionGridRef = useRef(null);
  const currentStepRef = useRef(null);
  const trackListRef = useRef(null);

  const completionPct = tutorialTrack.length
    ? Math.round((tutorialState.completedStepIds.length / tutorialTrack.length) * 100)
    : 0;

  const currentStep = tutorialTrack[Math.max(0, tutorialState.currentStepIndex)] || null;
  const guideSteps = useMemo(() => {
    const list = [
      {
        id: 'chapter-role',
        chapter: 'Capitolo 1',
        emoji: '👋',
        title: 'Scegli il tuo ruolo',
        text: 'Tocca una card ruolo. Il tutorial cambia in base al target cliente selezionato.',
        ref: roleGridRef
      },
      {
        id: 'chapter-perspective',
        chapter: 'Capitolo 2',
        emoji: '🔄',
        title: 'Cambia prospettiva',
        text: 'Scegli da quale sezione del target vuoi partire (es. Convenzioni, Pricing, Account).',
        ref: perspectiveRef
      },
      {
        id: 'chapter-start',
        chapter: 'Capitolo 3',
        emoji: '🚀',
        title: 'Avvia la guida operativa',
        text: 'Tocca "Inizia tutorial". Da qui entri nella fase inizia_tutorial.',
        ref: startActionsRef
      },
      {
        id: 'chapter-functions',
        chapter: 'Capitolo 4',
        emoji: '🧭',
        title: 'Capisci le funzioni principali',
        text: 'Queste card spiegano dove si trovano le aree chiave del prodotto.',
        ref: functionGridRef
      }
    ];

    if (currentStep && tutorialState.status === 'active') {
      list.push({
        id: 'chapter-action',
        chapter: 'Capitolo 5',
        emoji: '👉',
        title: 'Esegui lo step corrente',
        text: 'Usa "Vai allo step", fai l azione e poi premi "Segna step completato".',
        ref: currentStepRef
      });
    }

    list.push({
      id: 'chapter-track',
      chapter: 'Capitolo 6',
      emoji: '✅',
      title: 'Chiudi capitolo e passa al successivo',
      text: 'Ogni voce completata aggiorna la checklist. Quando finisci vedrai stato completed.',
      ref: trackListRef
    });

    return list;
  }, [currentStep, tutorialState.status]);

  const activeGuideStep = guideSteps[Math.max(0, Math.min(guideIndex, guideSteps.length - 1))] || null;

  usePageMeta({
    title: 'Tutorial Guidato | Motrice',
    description: 'Percorso tutorial strutturato per capire tutte le funzioni principali del sito in base al tuo ruolo.'
  });

  useEffect(() => {
    if (guideIndex > guideSteps.length - 1) {
      setGuideIndex(Math.max(0, guideSteps.length - 1));
    }
  }, [guideIndex, guideSteps.length]);

  useEffect(() => {
    if (!autoLaunchGuide || tutorialState.status !== 'active') return;
    const actionIndex = guideSteps.findIndex((item) => item.id === 'chapter-action');
    setGuideActive(true);
    setGuideIndex(actionIndex >= 0 ? actionIndex : 0);
    setAutoLaunchGuide(false);
  }, [autoLaunchGuide, guideSteps, tutorialState.status]);

  useEffect(() => {
    if (!guideActive || !activeGuideStep) return undefined;
    const target = activeGuideStep.ref?.current;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function updateLayout() {
      const element = activeGuideStep.ref?.current;
      if (!element) {
        setGuideLayout({
          bubble: {
            top: 80,
            left: 16,
            width: Math.min(360, window.innerWidth - 32)
          },
          arrowUp: true,
          spotlight: null
        });
        return;
      }

      const rect = element.getBoundingClientRect();
      const bubbleWidth = Math.min(360, Math.max(260, window.innerWidth - 32));
      const showBelow = rect.top < 240;
      const bubbleTop = showBelow ? rect.bottom + 12 : Math.max(16, rect.top - 170);
      const bubbleLeft = Math.min(
        window.innerWidth - bubbleWidth - 12,
        Math.max(12, rect.left + rect.width / 2 - bubbleWidth / 2)
      );

      setGuideLayout({
        bubble: {
          top: bubbleTop,
          left: bubbleLeft,
          width: bubbleWidth
        },
        arrowUp: showBelow,
        spotlight: {
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16
        }
      });
    }

    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);
    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [activeGuideStep, guideActive]);

  function onGuideNext() {
    if (guideIndex >= guideSteps.length - 1) {
      setGuideActive(false);
      return;
    }
    setGuideIndex((prev) => prev + 1);
  }

  function onGuidePrev() {
    setGuideIndex((prev) => Math.max(0, prev - 1));
  }

  function onSelectRole(roleId) {
    const next = setTutorialRole(roleId);
    // Keep UI selection explicit even if persisted state contains legacy values.
    setTutorialState({ ...next, selectedRole: roleId });
  }

  function onSelectPerspective(perspectiveId) {
    setTutorialState(setTutorialPerspective(perspectiveId));
  }

  function onStartTutorial() {
    const next = startTutorial(selectedRole, selectedPerspective, tutorialState.selectedGoal);
    setTutorialState(next);
    setAutoLaunchGuide(true);
    const track = getTutorialTrack(next.selectedRole, next.selectedPerspective);
    const step = track[Math.max(0, next.currentStepIndex)];
    if (step?.to) navigate(step.to);
  }

  function onSelectGoal(goalId) {
    setTutorialState(setTutorialGoal(goalId));
  }

  function onResumeTutorial() {
    navigate(tutorialState.resumeRoute || '/tutorial');
  }

  function onCompleteStep() {
    setTutorialState(completeCurrentStep());
  }

  function onResetTutorial() {
    setTutorialState(resetTutorial());
  }

  function isFunctionFeatured(item) {
    const itemRoute = String(item?.to || '');
    if (!itemRoute || !perspectiveStartRoute) return false;
    return itemRoute === perspectiveStartRoute;
  }

  return (
    <div className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <BookOpenCheck size={15} aria-hidden="true" /> Tutorial Mode
        </p>
        <h1>Percorso guidato per capire il prodotto prima di usarlo in produzione</h1>
        <p className="muted">
          Il tutorial e strutturato per target cliente. Ogni target vede solo sezioni e azioni utili al proprio lavoro.
        </p>

        <div className={styles.roleGrid} ref={roleGridRef}>
          {roles.map((role) => {
            const active = role.id === selectedRole;
            return (
              <button
                key={role.id}
                type="button"
                className={`${styles.roleCard} ${active ? styles.roleCardActive : ''}`}
                onClick={() => onSelectRole(role.id)}
                aria-pressed={active}
              >
                <span className={styles.roleHead}>
                  {active ? <span className={styles.roleArrow}>→</span> : null}
                  <UserRound size={14} aria-hidden="true" />
                  {role.label}
                </span>
                <span className={styles.roleDescription}>{role.description}</span>
                {active ? <span className={styles.roleSelectedPill}>Selezionato</span> : null}
              </button>
            );
          })}
        </div>

        <div className={styles.perspectiveWrap} ref={perspectiveRef}>
          <p className={styles.perspectiveLabel}>Prospettiva del target</p>
          <div className={styles.perspectiveGrid}>
            {perspectives.map((perspective) => {
              const active = perspective.id === selectedPerspective;
              return (
                <button
                  key={perspective.id}
                  type="button"
                  className={`${styles.perspectiveChip} ${active ? styles.perspectiveChipActive : ''}`}
                  onClick={() => onSelectPerspective(perspective.id)}
                  aria-pressed={active}
                >
                  {active ? <span className={styles.perspectiveArrow}>→</span> : null}
                  <span>{perspective.label}</span>
                </button>
              );
            })}
          </div>
          {perspectiveMeta ? <p className={styles.perspectiveDesc}>{perspectiveMeta.description}</p> : null}
        </div>

        {goals.length ? (
          <div className={styles.goalWrap}>
            <p className={styles.perspectiveLabel}>Obiettivo tutorial</p>
            <div className={styles.goalGrid}>
              {goals.map((goal) => {
                const active = goal.id === tutorialState.selectedGoal;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    className={`${styles.goalCard} ${active ? styles.goalCardActive : ''}`}
                    onClick={() => onSelectGoal(goal.id)}
                    aria-pressed={active}
                  >
                    <strong>{goal.label}</strong>
                    <span>{goal.description}</span>
                  </button>
                );
              })}
            </div>
            {goalMeta ? (
              <p className={styles.goalMeta}>
                Durata stimata: <strong>{tutorialState.estimatedMinutes || goalMeta.estimatedMinutes} min</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={styles.actions} ref={startActionsRef}>
          {tutorialState.status === 'active' ? (
            <Button type="button" variant="secondary" onClick={onResumeTutorial}>
              Riprendi da dove eri
            </Button>
          ) : null}
          <Button type="button" icon={PlayCircle} onClick={onStartTutorial}>
            Inizia tutorial
          </Button>
          <Button type="button" variant="secondary" icon={RotateCcw} onClick={onResetTutorial}>
            Reset tutorial
          </Button>
          <Button type="button" variant="ghost" onClick={() => {
            setGuideActive(true);
            setGuideIndex(0);
          }}>
            Avvia guida interattiva
          </Button>
        </div>
      </Card>

      <Card className={styles.section}>
        <h2 className={styles.sectionTitle}>Funzioni chiave per questo target</h2>
        <p className="muted">Qui trovi solo le aree rilevanti per il target selezionato, evitando percorsi non pertinenti.</p>
        <div className={styles.functionGrid} ref={functionGridRef}>
          {siteFunctions.map((item) => (
            <article key={item.id} className={`${styles.functionCard} ${isFunctionFeatured(item) ? styles.functionCardFeatured : ''}`}>
              <h3 className={styles.functionTitle}>
                {isFunctionFeatured(item) ? <span className={styles.functionArrow}>→</span> : null}
                {item.title}
              </h3>
              <p>{item.description}</p>
              <Link to={item.to} className={styles.inlineLink}>
                Apri {item.title}
              </Link>
            </article>
          ))}
        </div>
      </Card>

      <Card className={styles.section}>
        <div className={styles.progressHead}>
          <div>
            <h2>
              Percorso: {roles.find((role) => role.id === selectedRole)?.label || 'Utente'}
              {perspectiveMeta ? ` · ${perspectiveMeta.label}` : ''}
            </h2>
            <p className="muted">
              Stato: <strong>{tutorialState.status}</strong> | Fase: <strong>{tutorialState.phase}</strong>
            </p>
            {goalMeta ? (
              <p className="muted">
                Obiettivo: <strong>{goalMeta.label}</strong> | Durata stimata: <strong>{tutorialState.estimatedMinutes || goalMeta.estimatedMinutes} min</strong>
              </p>
            ) : null}
          </div>
          <p className={styles.progressPct}>{completionPct}% completato</p>
        </div>

        <div className={styles.progressMeta}>
          <p>Inizio: {formatDateTime(tutorialState.startedAt)}</p>
          <p>Completamento: {formatDateTime(tutorialState.completedAt)}</p>
        </div>

        {currentStep && tutorialState.status === 'active' ? (
          <article className={styles.currentStep} ref={currentStepRef}>
            <p className={styles.currentLabel}>Step corrente</p>
            <h3>{currentStep.title}</h3>
            <p>{currentStep.description}</p>
            <div className={styles.actions}>
              <Link to={currentStep.to} className={styles.stepCta}>
                <Compass size={14} aria-hidden="true" /> Vai allo step
              </Link>
              <Button type="button" icon={CheckCircle2} onClick={onCompleteStep}>
                Segna step completato
              </Button>
            </div>
          </article>
        ) : null}

        <div className={styles.trackList} ref={trackListRef}>
          {tutorialTrack.map((step, index) => {
            const isDone = tutorialState.completedStepIds.includes(step.id);
            const isCurrent = tutorialState.status === 'active' && tutorialState.currentStepIndex === index;
            return (
              <article key={step.id} className={`${styles.stepItem} ${isDone ? styles.stepDone : ''} ${isCurrent ? styles.stepCurrent : ''}`}>
                <div className={styles.stepBadge}>{index + 1}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <Link to={step.to} className={styles.inlineLink}>
                    Apri pagina
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </Card>

      {guideActive && activeGuideStep && guideLayout ? (
        <>
          <div className={styles.guideOverlay} />
          {guideLayout.spotlight ? (
            <div
              className={styles.guideSpotlight}
              style={{
                top: `${guideLayout.spotlight.top}px`,
                left: `${guideLayout.spotlight.left}px`,
                width: `${guideLayout.spotlight.width}px`,
                height: `${guideLayout.spotlight.height}px`
              }}
            />
          ) : null}
          <aside
            className={`${styles.guideBubble} ${guideLayout.arrowUp ? styles.guideBubbleUp : styles.guideBubbleDown}`}
            style={{
              top: `${guideLayout.bubble.top}px`,
              left: `${guideLayout.bubble.left}px`,
              width: `${guideLayout.bubble.width}px`
            }}
            role="dialog"
            aria-live="polite"
          >
            <p className={styles.guideChapter}>
              {activeGuideStep.chapter} · Step {guideIndex + 1}/{guideSteps.length}
            </p>
            <h3>{activeGuideStep.emoji} {activeGuideStep.title}</h3>
            <p>{activeGuideStep.text}</p>
            <div className={styles.guideActions}>
              <Button type="button" size="sm" variant="secondary" onClick={onGuidePrev} disabled={guideIndex === 0}>
                Indietro
              </Button>
              <Button type="button" size="sm" onClick={onGuideNext}>
                {guideIndex >= guideSteps.length - 1 ? 'Ok, ho capito' : 'Ho capito, avanti'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setGuideActive(false)}>
                Chiudi guida
              </Button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

export default TutorialPage;
