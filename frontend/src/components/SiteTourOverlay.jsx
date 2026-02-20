import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from './Button';
import {
  completeCurrentStep,
  getTutorialState,
  getTutorialTrack,
  goToTutorialStep,
  resetTutorial
} from '../services/tutorialMode';
import styles from '../styles/components/siteTourOverlay.module.css';

const ROLE_LABELS = {
  atleta: 'Tour Atleta',
  organizzatore: 'Tour Organizzatore',
  coach: 'Tour Coach',
  partner: 'Tour Partner Struttura'
};

const TARGET_SELECTORS = {
  '/explore': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/map': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/agenda': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/coach': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/convenzioni': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/pricing': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/notifications': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/account': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/faq': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/create': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/become-coach': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/dashboard/coach': ['#main-content h1', '#main-content h2', '#main-content section'],
  '/dashboard/plans': ['#main-content h1', '#main-content h2', '#main-content section']
};

const SECTION_TIPS = {
  '/explore': [
    '🧭 Usa i filtri in alto per restringere i risultati in pochi tap.',
    '🏷️ Apri una card evento per verificare sport, orario e disponibilita.',
    '➡️ Seleziona prima i match piu vicini ai tuoi obiettivi.'
  ],
  '/map': [
    '📍 Controlla posizione reale prima di confermare.',
    '🗺️ Confronta zona e distanza per evitare trasferte inutili.',
    '➡️ Passa poi alla card evento per i dettagli finali.'
  ],
  '/agenda': [
    '📅 Qui pianifichi la settimana con continuita.',
    '⚖️ Bilancia giorni intensi e giorni leggeri.',
    '➡️ Usa questa vista come base della routine.'
  ],
  '/coach': [
    '👤 Confronta profili coach per obiettivi e stile.',
    '🧠 Leggi bio e specializzazioni prima di decidere.',
    '➡️ Salva i profili migliori e confrontali.'
  ],
  '/convenzioni': [
    '🎟️ Controlla vantaggi attivi e condizioni.',
    '🏪 Valuta i partner piu utili alla tua routine.',
    '➡️ Verifica sempre durata e regole del voucher.'
  ],
  '/pricing': [
    '💳 Confronta limiti e funzionalita tra piani.',
    '📈 Valuta quando un upgrade e davvero utile.',
    '➡️ Allinea piano scelto alla frequenza d uso.'
  ],
  '/notifications': [
    '🔔 Qui arrivano reminder e aggiornamenti importanti.',
    '⏱️ Controlla spesso per reagire in tempo.',
    '➡️ Usa le notifiche come centro operativo rapido.'
  ],
  '/account': [
    '🪪 Aggiorna bio, immagine e preferenze.',
    '✅ Verifica stato piano e funzioni attive.',
    '➡️ Mantieni account curato per esperienza migliore.'
  ],
  '/faq': [
    '❓ Risolvi dubbi frequenti in autonomia.',
    '📚 Usa FAQ prima di aprire richieste.',
    '➡️ Ottima sezione per chiarimenti veloci.'
  ],
  '/create': [
    '✍️ Compila titolo, luogo, orario e capienza con precisione.',
    '🧩 Scrivi descrizione chiara e utile.',
    '➡️ Una card ben fatta aumenta conversione.'
  ],
  '/become-coach': [
    '📝 Completa candidatura con dati completi e coerenti.',
    '⏳ Dopo invio monitora stato e tempi di revisione.',
    '➡️ Prepara documenti prima di iniziare.'
  ],
  '/dashboard/coach': [
    '🎛️ Qui configuri offerta coach e operativita.',
    '📊 Usa la dashboard come centro controllo.',
    '➡️ Mantieni struttura servizi coerente.'
  ],
  '/dashboard/plans': [
    '🧱 Gestisci schede e progressioni cliente.',
    '🔁 Mantieni piani semplici e ripetibili.',
    '➡️ Allinea carico, obiettivi e calendario.'
  ]
};

const ROLE_SECTION_TIPS = {
  partner: {
    '/convenzioni': [
      '🏢 Questa sezione e la base per associazioni e palestre convenzionate.',
      '📨 Completa candidatura con dati struttura e controlla stato revisione.',
      '➡️ Verifica se lo stato passa da pending ad approved e cosa manca.'
    ],
    '/pricing': [
      '📊 Confronta Free/Premium in base a promo e capacita commerciale.',
      '💼 Scegli il piano in funzione dei corsi e della stagionalita.',
      '➡️ Allinea il piano alla strategia della struttura.'
    ],
    '/account': [
      '🧾 Tieni aggiornati i dati ufficiali della struttura.',
      '📞 Contatti chiari velocizzano verifiche e onboarding.',
      '➡️ Profilo completo = maggiore affidabilita percepita.'
    ],
    '/faq': [
      '⏳ Qui trovi tempi di attesa e passaggi di approvazione.',
      '⚙️ Consulta le regole prima di operare su convenzioni/voucher.',
      '➡️ Usa questa sezione per ridurre errori procedurali.'
    ]
  }
};

function normalizePath(pathname) {
  if (!pathname) return '/';
  if (pathname.startsWith('/dashboard/coach')) return '/dashboard/coach';
  if (pathname.startsWith('/dashboard/plans')) return '/dashboard/plans';
  return pathname;
}

function collectSectionHints() {
  try {
    const nodes = Array.from(document.querySelectorAll('#main-content h2, #main-content h3'))
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
    const unique = [...new Set(nodes)].slice(0, 3);
    return unique.map((label) => `➡️ Sezione: ${label}`);
  } catch {
    return [];
  }
}

function findBestTargetElement(pathname) {
  const selectors = TARGET_SELECTORS[pathname] || [];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node) return node;
  }
  return document.querySelector('#main-content h1') || document.querySelector('#main-content') || document.querySelector('main');
}

function collectElementsToExplain(pathname) {
  const state = getTutorialState();
  const role = state.selectedRole;
  const partnerKeywordsByPath = {
    '/convenzioni': ['convenzioni', 'candidatura', 'voucher', 'partner'],
    '/pricing': ['piano', 'premium', 'free', 'abbonamento', 'pricing'],
    '/account': ['profilo', 'account', 'bio', 'immagine'],
    '/faq': ['faq', 'attesa', 'approvazione', 'regole']
  };

  if (role === 'partner') {
    const keywords = partnerKeywordsByPath[pathname] || [];
    const headlineNodes = Array.from(document.querySelectorAll('#main-content h2, #main-content h3'));
    const matches = headlineNodes.filter((node) => {
      const text = String(node.textContent || '').toLowerCase();
      return keywords.some((keyword) => text.includes(keyword));
    });
    if (matches.length) return matches.slice(0, 3);
  }

  const selectors = TARGET_SELECTORS[pathname] || [];
  const bucket = [];
  selectors.forEach((selector) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    nodes.forEach((node) => {
      if (bucket.length < 3 && !bucket.includes(node)) bucket.push(node);
    });
  });
  return bucket;
}

function SiteTourOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const tutorialState = getTutorialState();
  const [layout, setLayout] = useState(null);
  const active = tutorialState.status === 'active';
  const track = useMemo(
    () => getTutorialTrack(tutorialState.selectedRole, tutorialState.selectedPerspective),
    [tutorialState.selectedRole, tutorialState.selectedPerspective]
  );

  const index = Math.max(0, Math.min(track.length - 1, tutorialState.currentStepIndex));
  const step = track[index];
  const targetPath = normalizePath(step?.to || '/');
  const currentPath = normalizePath(location.pathname);
  const inStepPage = currentPath === targetPath;
  const roleTips = ROLE_SECTION_TIPS[tutorialState.selectedRole]?.[targetPath] || null;
  const tips = roleTips || SECTION_TIPS[targetPath] || [`ℹ️ ${step?.description || ''}`];
  const sectionHints = collectSectionHints();
  const roleLabel = ROLE_LABELS[tutorialState.selectedRole] || 'Tour sito';

  useEffect(() => {
    if (!active || !step || !inStepPage) return undefined;
    const highlighted = collectElementsToExplain(targetPath);
    highlighted.forEach((el) => {
      if (!el) return;
      const tag = String(el.tagName || '').toLowerCase();
      const className = tag.startsWith('h') ? 'tour-explain-title' : 'tour-explain-card';
      el.classList.add(className);
    });

    return () => {
      highlighted.forEach((el) => {
        if (!el) return;
        el.classList.remove('tour-explain-title');
        el.classList.remove('tour-explain-card');
      });
    };
  }, [active, inStepPage, step, targetPath, location.pathname]);

  useEffect(() => {
    if (!active || !step) return undefined;

    function updateLayout() {
      const targetEl = findBestTargetElement(targetPath);

      if (!targetEl) {
        setLayout({
          bubble: { top: 84, left: 16, width: Math.min(380, window.innerWidth - 32) },
          arrowUp: true,
          spotlight: null
        });
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      const bubbleWidth = Math.min(380, Math.max(280, window.innerWidth - 32));
      const bubbleEstimatedHeight = 360;
      const showBelow = rect.top < 220;
      const preferredTop = showBelow ? rect.bottom + 14 : Math.max(16, rect.top - 188);
      const bubbleTop = Math.min(
        Math.max(12, preferredTop),
        Math.max(12, window.innerHeight - bubbleEstimatedHeight - 12)
      );
      const bubbleLeft = Math.min(
        window.innerWidth - bubbleWidth - 12,
        Math.max(12, rect.left + rect.width / 2 - bubbleWidth / 2)
      );

      setLayout({
        bubble: { top: bubbleTop, left: bubbleLeft, width: bubbleWidth },
        arrowUp: showBelow,
        spotlight: {
          top: Math.max(4, rect.top - 8),
          left: Math.max(4, rect.left - 8),
          width: Math.max(32, Math.min(window.innerWidth - 8, rect.width + 16)),
          height: Math.max(28, rect.height + 16)
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
  }, [active, step, targetPath, location.pathname]);

  if (!active || !step || !layout) return null;

  function goPrev() {
    if (index <= 0) return;
    const nextState = goToTutorialStep(index - 1);
    const nextTrack = getTutorialTrack(nextState.selectedRole, nextState.selectedPerspective);
    const prevStep = nextTrack[Math.max(0, nextState.currentStepIndex)];
    if (prevStep?.to) navigate(prevStep.to);
  }

  function goNext() {
    const nextState = completeCurrentStep();
    if (nextState.status === 'done') {
      navigate('/tutorial');
      return;
    }
    const nextTrack = getTutorialTrack(nextState.selectedRole, nextState.selectedPerspective);
    const nextStep = nextTrack[Math.max(0, nextState.currentStepIndex)];
    if (nextStep?.to) navigate(nextStep.to);
  }

  return (
    <>
      <div className={styles.guideOverlay} />
      {layout.spotlight ? (
        <div
          className={styles.guideSpotlight}
          style={{
            top: `${layout.spotlight.top}px`,
            left: `${layout.spotlight.left}px`,
            width: `${layout.spotlight.width}px`,
            height: `${layout.spotlight.height}px`
          }}
        />
      ) : null}

      <aside
        className={`${styles.guideBubble} ${layout.arrowUp ? styles.guideBubbleUp : styles.guideBubbleDown}`}
        style={{
          top: `${layout.bubble.top}px`,
          left: `${layout.bubble.left}px`,
          width: `${layout.bubble.width}px`
        }}
        role="dialog"
        aria-live="polite"
      >
        <p className={styles.guideChapter}>
          {roleLabel} · Step {index + 1}/{track.length}
        </p>
        <h3>{step.title}</h3>
        <p className={styles.desc}>{step.description}</p>
        {!inStepPage ? (
          <Button type="button" size="sm" onClick={() => navigate(step.to)}>
            Vai alla sezione
          </Button>
        ) : null}
        <ul className={styles.list}>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
          {inStepPage
            ? sectionHints.map((tip) => (
              <li key={tip}>{tip}</li>
            ))
            : null}
        </ul>
        {inStepPage ? <p className={styles.hintFooter}>Le sezioni evidenziate con freccia sono quelle da osservare adesso.</p> : null}
        <div className={styles.guideActions}>
          <Button type="button" size="sm" variant="secondary" onClick={goPrev} disabled={index === 0}>
            Indietro
          </Button>
          <Button type="button" size="sm" onClick={goNext}>
            Ho capito, avanti
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              resetTutorial();
              navigate('/tutorial');
            }}
          >
            Esci tour
          </Button>
        </div>
      </aside>
    </>
  );
}

export default SiteTourOverlay;
