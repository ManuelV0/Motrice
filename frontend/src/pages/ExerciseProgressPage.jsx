import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Dumbbell,
  Search,
  TrendingUp
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { loadWorkoutExerciseHistory } from '../features/workout/services/workoutSessionStore';
import styles from '../styles/pages/exerciseProgress.module.css';

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString('it-IT', { maximumFractionDigits });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function summarizeHistory(history) {
  const groups = new Map();
  history.forEach((entry) => {
    const key = String(entry?.exerciseKey || entry?.exerciseName || 'esercizio');
    const records = groups.get(key) || [];
    records.push({
      ...entry,
      weightKg: Math.max(0, Number(entry?.weightKg) || 0),
      reps: Math.max(0, Number(entry?.reps) || 0)
    });
    groups.set(key, records);
  });

  return [...groups.entries()].map(([key, records]) => {
    const sorted = [...records].sort(
      (left, right) => Date.parse(left.completedAt || 0) - Date.parse(right.completedAt || 0)
    );
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const maxWeight = Math.max(0, ...sorted.map((record) => record.weightKg));
    const totalVolume = sorted.reduce(
      (sum, record) => sum + (record.weightKg * Math.max(1, record.reps)),
      0
    );
    const bestEstimatedMax = Math.max(
      0,
      ...sorted.map((record) => record.weightKg * (1 + record.reps / 30))
    );
    const improvementKg = latest.weightKg - first.weightKg;
    const improvementPercent = first.weightKg > 0
      ? Math.round((improvementKg / first.weightKg) * 100)
      : 0;

    return {
      key,
      name: latest.exerciseName || first.exerciseName || 'Esercizio',
      records: [...sorted].reverse(),
      firstWeight: first.weightKg,
      latestWeight: latest.weightKg,
      maxWeight,
      totalSets: sorted.length,
      totalVolume,
      bestEstimatedMax,
      improvementKg,
      improvementPercent,
      lastCompletedAt: latest.completedAt
    };
  }).sort((left, right) => Date.parse(right.lastCompletedAt || 0) - Date.parse(left.lastCompletedAt || 0));
}

function ExerciseProgressPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => loadWorkoutExerciseHistory());
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState('');

  usePageMeta({
    title: 'Progressi esercizi | Motrice',
    description: 'Carichi, volume e miglioramenti degli esercizi completati su Motrice.'
  });

  useEffect(() => {
    const refresh = () => setHistory(loadWorkoutExerciseHistory());
    window.addEventListener('storage', refresh);
    window.addEventListener('motrice-workout-history-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('motrice-workout-history-changed', refresh);
    };
  }, []);

  const summaries = useMemo(() => summarizeHistory(history), [history]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return summaries;
    return summaries.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [query, summaries]);
  const totalSets = history.length;
  const totalVolume = history.reduce(
    (sum, entry) => sum + ((Number(entry?.weightKg) || 0) * Math.max(1, Number(entry?.reps) || 0)),
    0
  );
  const improvingExercises = summaries.filter((item) => item.improvementKg > 0).length;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <button type="button" className={styles.backButton} onClick={() => navigate(-1)} aria-label="Torna indietro">
          <ArrowLeft size={21} />
        </button>
        <span className={styles.heroIcon}><TrendingUp size={25} /></span>
        <div>
          <p>ALLENAMENTO PERSONALE</p>
          <h1>Progressi esercizi</h1>
          <span>Carichi e risultati registrati durante le tue sessioni.</span>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="Riepilogo progressi">
        <article>
          <Dumbbell size={18} />
          <strong>{summaries.length}</strong>
          <span>Esercizi</span>
        </article>
        <article>
          <BarChart3 size={18} />
          <strong>{totalSets}</strong>
          <span>Serie registrate</span>
        </article>
        <article>
          <TrendingUp size={18} />
          <strong>{improvingExercises}</strong>
          <span>In miglioramento</span>
        </article>
      </section>

      <section className={styles.volumeCard}>
        <div>
          <small>VOLUME TOTALE REGISTRATO</small>
          <strong>{formatNumber(totalVolume)} kg</strong>
        </div>
        <p>Si aggiorna automaticamente quando completi una serie nella scheda allenamento.</p>
      </section>

      {summaries.length ? (
        <label className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca esercizio"
            aria-label="Cerca esercizio nello storico"
          />
        </label>
      ) : null}

      <section className={styles.exerciseSection}>
        <div className={styles.sectionHeading}>
          <div><small>STORICO PERSONALE</small><h2>Ogni esercizio</h2></div>
          <span>{filtered.length}</span>
        </div>

        {!summaries.length ? (
          <div className={styles.emptyState}>
            <span><Dumbbell size={28} /></span>
            <h2>Ancora nessun carico registrato</h2>
            <p>Avvia una scheda da “I miei eventi”, inserisci il carico e completa almeno una serie.</p>
            <button type="button" onClick={() => navigate('/agenda')}>Vai ai miei eventi</button>
          </div>
        ) : filtered.length ? (
          <div className={styles.exerciseList}>
            {filtered.map((item) => {
              const open = openKey === item.key;
              const positive = item.improvementKg > 0;
              const neutral = item.improvementKg === 0;
              return (
                <article key={item.key} className={`${styles.exerciseCard} ${open ? styles.exerciseCardOpen : ''}`}>
                  <button
                    type="button"
                    className={styles.exerciseToggle}
                    onClick={() => setOpenKey(open ? '' : item.key)}
                    aria-expanded={open}
                  >
                    <span className={styles.exerciseIcon}><Dumbbell size={19} /></span>
                    <span className={styles.exerciseIdentity}>
                      <strong>{item.name}</strong>
                      <small>Aggiornato {formatDate(item.lastCompletedAt)}</small>
                    </span>
                    <span className={styles.exerciseBest}>
                      <small>MIGLIOR CARICO</small>
                      <strong>{item.maxWeight > 0 ? `${formatNumber(item.maxWeight, 1)} kg` : 'Corpo libero'}</strong>
                    </span>
                    <ChevronDown className={open ? styles.chevronOpen : ''} />
                  </button>

                  <div className={styles.improvementRow}>
                    <span className={positive ? styles.positive : neutral ? styles.neutral : styles.negative}>
                      {positive ? '+' : ''}{formatNumber(item.improvementKg, 1)} kg
                      {item.improvementPercent ? ` · ${item.improvementPercent > 0 ? '+' : ''}${item.improvementPercent}%` : ''}
                    </span>
                    <span>{item.totalSets} serie</span>
                    <span>{formatNumber(item.totalVolume)} kg volume</span>
                  </div>

                  {open ? (
                    <div className={styles.exerciseDetails}>
                      <div className={styles.metricGrid}>
                        <span><small>PRIMO CARICO</small><strong>{formatNumber(item.firstWeight, 1)} kg</strong></span>
                        <span><small>ULTIMO CARICO</small><strong>{formatNumber(item.latestWeight, 1)} kg</strong></span>
                        <span><small>1RM STIMATO</small><strong>{formatNumber(item.bestEstimatedMax, 1)} kg</strong></span>
                      </div>
                      <div className={styles.historyHeading}>
                        <span><CalendarDays size={15} /> Ultime serie</span>
                        <small>Le 8 più recenti</small>
                      </div>
                      <ol className={styles.historyList}>
                        {item.records.slice(0, 8).map((record) => (
                          <li key={record.id}>
                            <span>{formatDate(record.completedAt)}</span>
                            <span>Serie {record.setNumber}</span>
                            <strong>{record.weightKg > 0 ? `${formatNumber(record.weightKg, 1)} kg` : 'Corpo libero'} × {record.reps || '—'}</strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.noResults}>Nessun esercizio corrisponde alla ricerca.</div>
        )}
      </section>
    </main>
  );
}

export default ExerciseProgressPage;
