import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Flame,
  Minus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import {
  loadWorkoutExerciseHistory,
  mergeWorkoutExerciseHistory
} from '../features/workout/services/workoutSessionStore';
import {
  sortExerciseSummaries,
  summarizeProgressDashboard
} from '../utils/exerciseProgress';
import styles from '../styles/pages/exerciseProgress.module.css';

const PERIODS = [
  { value: '4w', label: '4 settimane' },
  { value: '3m', label: '3 mesi' },
  { value: 'all', label: 'Tutto' }
];

const SORTS = [
  { value: 'recent', label: 'Più recenti' },
  { value: 'improvement', label: 'Miglioramento' },
  { value: 'records', label: 'Nuovi record' },
  { value: 'alphabetical', label: 'A–Z' }
];

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits });
}

function formatDate(value, compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', compact
    ? { day: '2-digit', month: '2-digit' }
    : { day: 'numeric', month: 'long', year: 'numeric' }
  ).format(date);
}

function setPerformanceLabel(record, bodyweight) {
  if (!record || Number(record.reps || 0) <= 0) {
    return Number(record?.weightKg || 0) > 0
      ? `${formatNumber(record.weightKg, 1)} kg · rip. mancanti`
      : 'Ripetizioni non registrate';
  }
  if (bodyweight) return `${formatNumber(record.reps)} rip.`;
  return `${formatNumber(record.weightKg, 1)} kg × ${formatNumber(record.reps)}`;
}

function bestSetLabel(item) {
  return setPerformanceLabel(item.bestSet, item.bodyweight);
}

function latestSetLabel(item) {
  return setPerformanceLabel(item.latestSession?.bestSet, item.bodyweight);
}

function trendLabel(item, compact = false) {
  if (item.trendStatus === 'incomplete') return 'Dati incompleti';
  if (item.isRecord) return compact
    ? `Record · +${item.trendPercent}%`
    : `Nuovo record · +${item.trendPercent}% rispetto alla sessione precedente`;
  if (item.trendStatus === 'new') return 'Prima sessione';
  if (item.trendStatus === 'stable') return compact ? 'Stabile vs prec.' : 'Stabile rispetto alla sessione precedente';
  const delta = `${item.trendPercent > 0 ? '+' : ''}${item.trendPercent}%`;
  return compact ? `${delta} vs prec.` : `${delta} rispetto alla sessione precedente`;
}

function TrendIcon({ item, size = 14 }) {
  if (item.isRecord) return <Trophy size={size} />;
  if (item.trendStatus === 'down') return <ArrowDownRight size={size} />;
  if (item.trendStatus === 'up') return <ArrowUpRight size={size} />;
  if (item.trendStatus === 'incomplete') return <CircleAlert size={size} />;
  if (item.trendStatus === 'new') return <Sparkles size={size} />;
  return <Minus size={size} />;
}

function chartPoints(values, width = 320, height = 126, inset = 12) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : inset + (index / (values.length - 1)) * (width - inset * 2),
    y: max === min ? height / 2 : height - inset - ((value - min) / range) * (height - inset * 2)
  }));
}

function MiniTrend({ item }) {
  const values = item.chartSessions.map((session) => (
    item.bodyweight ? session.bestReps : session.bestEstimatedMax
  )).slice(-7);
  const points = chartPoints(values, 76, 30, 3);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return (
    <svg className={styles.miniTrend} viewBox="0 0 76 30" aria-hidden="true">
      <path d={path || 'M3,15 L73,15'} />
      {points.map((point, index) => <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 2.8 : 1.7} />)}
    </svg>
  );
}

function PerformanceChart({ item, metric }) {
  if (!item.chartSessions.length) {
    return (
      <div className={styles.chartEmpty} role="status">
        <CircleAlert size={21} aria-hidden="true" />
        <strong>Grafico non ancora disponibile</strong>
        <span>Registra almeno una serie completa di ripetizioni.</span>
      </div>
    );
  }
  const values = item.chartSessions.map((session) => {
    if (item.bodyweight) {
      if (metric === 'sets') return session.sets;
      if (metric === 'volume') return session.totalReps;
      return session.bestReps;
    }
    if (metric === 'max') return session.bestEstimatedMax;
    if (metric === 'volume') return session.volume;
    return session.bestWeight;
  });
  const points = chartPoints(values);
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = points.length
    ? `${line} L${points[points.length - 1].x},126 L${points[0].x},126 Z`
    : '';
  const unit = item.bodyweight ? (metric === 'sets' ? 'serie' : 'rip.') : 'kg';

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartScale}>
        <span>{formatNumber(Math.max(0, ...values), 1)} {unit}</span>
        <span>{values.length} {values.length === 1 ? 'sessione' : 'sessioni'}</span>
      </div>
      <svg className={styles.detailChart} viewBox="0 0 320 126" role="img" aria-label="Andamento delle prestazioni">
        <defs>
          <linearGradient id={`progress-${item.key}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c6ff00" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#c6ff00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="8" x2="312" y1="20" y2="20" />
        <line x1="8" x2="312" y1="63" y2="63" />
        <line x1="8" x2="312" y1="106" y2="106" />
        {area ? <path className={styles.chartArea} d={area} fill={`url(#progress-${item.key})`} /> : null}
        <path className={styles.chartLine} d={line || 'M12,63 L308,63'} />
        {points.map((point, index) => (
          <circle key={`${point.x}-${index}`} className={index === points.length - 1 ? styles.chartPointLatest : styles.chartPoint} cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3} />
        ))}
      </svg>
      <div className={styles.chartDates}>
        <span>{formatDate(item.chartSessions[0]?.completedAt, true)}</span>
        <span>{formatDate(item.chartSessions[item.chartSessions.length - 1]?.completedAt, true)}</span>
      </div>
    </div>
  );
}

function ExerciseDetailSheet({ item, onClose }) {
  const [metric, setMetric] = useState(item.bodyweight ? 'reps' : 'load');
  const tabs = item.bodyweight
    ? [{ value: 'reps', label: 'Ripetizioni' }, { value: 'sets', label: 'Serie' }, { value: 'volume', label: 'Volume' }]
    : [{ value: 'load', label: 'Carico' }, { value: 'max', label: '1RM' }, { value: 'volume', label: 'Volume' }];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.sheetLayer} role="presentation">
      <button type="button" className={styles.sheetBackdrop} onClick={onClose} aria-label="Chiudi dettaglio" />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="exercise-detail-title">
        <div className={styles.sheetHandle} />
        <header className={styles.sheetHeader}>
          <span className={styles.sheetIcon}><Dumbbell size={21} /></span>
          <div>
            <small>PROGRESSO ESERCIZIO</small>
            <h2 id="exercise-detail-title">{item.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi"><span aria-hidden="true">×</span></button>
        </header>

        <div className={styles.sheetScroll}>
          <section className={styles.primaryMetric}>
            <div>
              <small>ULTIMA PRESTAZIONE</small>
              <strong>{latestSetLabel(item)}</strong>
              <span>{formatDate(item.latestSession?.completedAt)}</span>
            </div>
            <span
              className={`${styles.trendPill} ${styles[item.trendStatus]}`}
              aria-label={trendLabel(item)}
              title={trendLabel(item)}
            >
              <TrendIcon item={item} />
              {trendLabel(item, true)}
            </span>
          </section>

          {item.hasValidPerformance ? (
            <section className={styles.personalBest} aria-label="Record personale">
              <span><Trophy size={17} aria-hidden="true" /></span>
              <div><small>RECORD PERSONALE</small><strong>{bestSetLabel(item)}</strong></div>
              <time>{formatDate(item.bestSet?.completedAt)}</time>
            </section>
          ) : null}

          <section className={styles.chartCard}>
            <div className={styles.chartTabs} role="tablist" aria-label="Metrica del grafico">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={metric === tab.value ? styles.chartTabActive : ''}
                  onClick={() => setMetric(tab.value)}
                  role="tab"
                  aria-selected={metric === tab.value}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <PerformanceChart item={item} metric={metric} />
          </section>

          <section className={styles.detailMetrics} aria-label="Statistiche esercizio">
            <article><small>SESSIONI</small><strong>{item.sessionCount}</strong></article>
            <article><small>{item.bodyweight ? 'MAX RIP.' : '1RM STIMATO'}</small><strong>{item.hasValidPerformance ? (item.bodyweight ? item.bestReps : `${formatNumber(item.bestEstimatedMax, 1)} kg`) : '—'}</strong></article>
            <article><small>{item.bodyweight ? 'RIP. TOTALI' : 'VOLUME'}</small><strong>{item.hasValidPerformance ? (item.bodyweight ? item.totalReps : `${formatNumber(item.totalVolume)} kg`) : '—'}</strong></article>
          </section>

          <section className={styles.sessionHistory}>
            <header>
              <div><CalendarDays size={17} /><strong>Storico sessioni</strong></div>
              <span>{item.sessionCount}</span>
            </header>
            <div className={styles.sessionList}>
              {item.sessions.map((session) => (
                <article key={session.eventId} className={styles.sessionCard}>
                  <div className={styles.sessionTitle}>
                    <div><strong>{formatDate(session.completedAt)}</strong><small>{session.sets} {session.sets === 1 ? 'serie completata' : 'serie completate'}</small></div>
                    <span>{setPerformanceLabel(session.bestSet, item.bodyweight)}</span>
                  </div>
                  <div className={styles.setRows}>
                    {session.records.map((record) => (
                      <div key={record.id}>
                        <span>Serie {record.setNumber}</span>
                        <strong>{setPerformanceLabel(record, item.bodyweight)}</strong>
                        <small>RIR {formatNumber(record.rir)}</small>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ExerciseProgressPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => loadWorkoutExerciseHistory());
  const [period, setPeriod] = useState('4w');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [selectedExercise, setSelectedExercise] = useState(null);

  usePageMeta({
    title: 'Progressi esercizi | Motrice',
    description: 'Carichi, volume e miglioramenti degli esercizi completati su Motrice.'
  });

  useEffect(() => {
    let active = true;
    const refresh = () => setHistory(loadWorkoutExerciseHistory());
    window.addEventListener('storage', refresh);
    window.addEventListener('motrice-workout-history-changed', refresh);
    api.listWorkoutExerciseHistory()
      .then((remoteHistory) => {
        if (active && Array.isArray(remoteHistory) && remoteHistory.length) {
          setHistory(mergeWorkoutExerciseHistory(remoteHistory));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener('storage', refresh);
      window.removeEventListener('motrice-workout-history-changed', refresh);
    };
  }, []);

  const dashboard = useMemo(() => summarizeProgressDashboard(history, period), [history, period]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('it');
    const matching = normalizedQuery
      ? dashboard.summaries.filter((item) => item.name.toLocaleLowerCase('it').includes(normalizedQuery))
      : dashboard.summaries;
    return sortExerciseSummaries(matching, sortBy);
  }, [dashboard.summaries, query, sortBy]);

  const periodLabel = PERIODS.find((item) => item.value === period)?.label || 'Periodo';
  const delta = dashboard.volumeDeltaPercent;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p>ALLENAMENTO PERSONALE</p>
          <h1>Progressi esercizi</h1>
        </div>
        <span className={styles.exerciseCount}>{dashboard.exerciseCount}<small>esercizi</small></span>
      </header>

      <nav className={styles.periodTabs} aria-label="Periodo dei progressi">
        {PERIODS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={period === item.value ? styles.periodActive : ''}
            onClick={() => setPeriod(item.value)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className={styles.overviewCard} aria-label={`Riepilogo ${periodLabel}`}>
        <div className={styles.volumeMetric}>
          <span><Flame size={15} /> VOLUME · {periodLabel.toUpperCase()}</span>
          <strong>{formatNumber(dashboard.totalVolume)} <small>kg</small></strong>
          {delta == null ? <p>Confronto disponibile dal prossimo periodo</p> : (
            <p className={delta >= 0 ? styles.deltaPositive : styles.deltaNegative}>
              {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {delta > 0 ? '+' : ''}{delta}% rispetto al periodo precedente
            </p>
          )}
        </div>
        <div className={styles.quickMetrics}>
          <span><strong>{dashboard.sessionCount}</strong><small>Sessioni</small></span>
          <span><strong>{dashboard.totalSets}</strong><small>Serie</small></span>
          <span><strong>{dashboard.recordCount}</strong><small>Record</small></span>
        </div>
      </section>

      {dashboard.summaries.length ? (
        <div className={styles.toolsBar}>
          <label className={styles.searchBox}>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca esercizio"
              aria-label="Cerca esercizio nello storico"
            />
          </label>
          <label className={styles.sortBox}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordina esercizi">
              {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <section className={styles.exerciseSection}>
        <div className={styles.sectionHeading}>
          <div><small>STORICO PERSONALE</small><h2>I tuoi esercizi</h2></div>
          <span>{filtered.length}</span>
        </div>

        {!dashboard.summaries.length && history.length ? (
          <div className={styles.emptyState}>
            <span><CalendarDays size={27} /></span>
            <h2>Nessuna sessione in questo periodo</h2>
            <p>I tuoi progressi precedenti sono conservati. Passa alla vista completa per consultarli.</p>
            <button type="button" onClick={() => setPeriod('all')}>Mostra tutto lo storico</button>
          </div>
        ) : !dashboard.summaries.length ? (
          <div className={styles.emptyState}>
            <span><Dumbbell size={28} /></span>
            <h2>Inizia a costruire i tuoi progressi</h2>
            <p>Completa una serie nella scheda live: carichi e prestazioni compariranno qui automaticamente.</p>
            <button type="button" onClick={() => navigate('/agenda')}>Vai ai miei eventi</button>
          </div>
        ) : filtered.length ? (
          <div className={styles.exerciseList}>
            {filtered.map((item) => (
              <button key={item.key} type="button" className={styles.exerciseCard} onClick={() => setSelectedExercise(item)}>
                <span className={styles.exerciseIcon}><Dumbbell size={18} /></span>
                <span className={styles.exerciseIdentity}>
                  <strong>{item.name}</strong>
                  <small>Ultima: {latestSetLabel(item)} · {formatDate(item.lastCompletedAt, true)}</small>
                </span>
                <span
                  className={`${styles.cardTrend} ${styles[item.trendStatus]} ${item.isRecord ? styles.record : ''}`}
                  aria-label={trendLabel(item)}
                  title={trendLabel(item)}
                >
                  <TrendIcon item={item} size={12} />
                  {trendLabel(item, true)}
                </span>
                <MiniTrend item={item} />
                <ChevronRight className={styles.cardChevron} size={19} />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.noResults}>
            <Search size={22} />
            <strong>Nessun esercizio trovato</strong>
            <span>Prova un nome diverso o cambia ordinamento.</span>
          </div>
        )}
      </section>

      {selectedExercise ? (
        <ExerciseDetailSheet item={selectedExercise} onClose={() => setSelectedExercise(null)} />
      ) : null}
    </main>
  );
}

export default ExerciseProgressPage;
