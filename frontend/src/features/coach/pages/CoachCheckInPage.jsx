import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CheckCircle, Flame } from 'lucide-react';
import { api } from '../../../services/api';
import { getCoachProfile, getStats, logCheckIn } from '../services/coach';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import EmptyState from '../../../components/EmptyState';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import styles from '../../../styles/pages/coach.module.css';

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  sport: '',
  duration: 45,
  intensity: 'medium',
  mood: 4,
  notes: ''
};

function CoachCheckInPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sports, setSports] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [stats, setStats] = useState(getStats());
  const [hasProfile] = useState(Boolean(getCoachProfile()));

  usePageMeta({
    title: 'Coach Check-in | Motrice',
    description: 'Registra una sessione completata, aggiorna streak e progressi settimanali.'
  });

  useEffect(() => {
    api.listSports().then(setSports);
  }, []);

  function onSubmit(event) {
    event.preventDefault();
    if (!form.sport || !form.date || Number(form.duration) <= 0) {
      showToast('Compila i campi richiesti', 'error');
      return;
    }

    const result = logCheckIn({
      date: form.date,
      sport: form.sport,
      duration: Number(form.duration),
      intensity: form.intensity,
      mood: Number(form.mood),
      notes: form.notes
    });

    setStats(result.stats);
    setForm(initialForm);
    showToast('Grande lavoro. Sessione registrata.', 'success');
  }

  if (!hasProfile) {
    return (
      <EmptyState
        icon={Activity}
        imageSrc="/images/palestra.svg"
        imageAlt="Check-in coach"
        title="Attiva Coach per il check-in"
        description="Il check-in aggiorna streak e metriche del tuo piano settimanale."
        primaryActionLabel="Attiva Coach"
        onPrimaryAction={() => navigate('/coach')}
      />
    );
  }

  return (
    <section className={styles.page}>
      <h1>Coach check-in</h1>
      <div className="grid2">
        <Card>
          <h2>Log sessione</h2>
          <form onSubmit={onSubmit} className="stack">
            <label>
              Data
              <input type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
            </label>
            <label>
              Sport
              <select value={form.sport} onChange={(event) => setForm((prev) => ({ ...prev, sport: event.target.value }))}>
                <option value="">Seleziona</option>
                {sports.map((sport) => (
                  <option key={sport.id} value={sport.name}>
                    {sport.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid2">
              <label>
                Durata (min)
                <input
                  type="number"
                  min="1"
                  value={form.duration}
                  onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
                />
              </label>
              <label>
                Intensita
                <select
                  value={form.intensity}
                  onChange={(event) => setForm((prev) => ({ ...prev, intensity: event.target.value }))}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
            <label>
              Umore (1-5)
              <input
                type="range"
                min="1"
                max="5"
                value={form.mood}
                onChange={(event) => setForm((prev) => ({ ...prev, mood: event.target.value }))}
              />
            </label>
            <label>
              Note
              <textarea rows="3" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <Button type="submit">Salva check-in</Button>
          </form>
        </Card>

        <Card>
          <h2>Progressi locali</h2>
          <p className="row">
            <Flame size={18} aria-hidden="true" /> Streak attuale: <strong>{stats.streak || 0}</strong>
          </p>
          <p className="row">
            <CheckCircle size={18} aria-hidden="true" /> Sessioni completate: <strong>{stats.completedSessions || 0}</strong>
          </p>
          <p className="muted">
            Ogni check-in aggiorna automaticamente lo storico locale e aiuta Coach a mantenere il piano allineato.
          </p>
        </Card>
      </div>
    </section>
  );
}

export default CoachCheckInPage;
