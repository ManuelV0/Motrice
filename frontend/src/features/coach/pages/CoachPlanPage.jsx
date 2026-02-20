import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, Clock3, Plus } from 'lucide-react';
import { api } from '../../../services/api';
import {
  addCustomSession,
  completePlanItem,
  generatePlan,
  getCoachProfile,
  getPlan,
  getWeekStart,
  reschedulePlanItem
} from '../services/coach';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useToast } from '../../../context/ToastContext';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import styles from '../../../styles/pages/coach.module.css';

function CoachPlanPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [custom, setCustom] = useState({ title: '', sport_id: '', datetime: '' });
  const [sports, setSports] = useState([]);

  usePageMeta({
    title: 'Coach Plan | Motrice',
    description: 'Pianifica, completa e riprogramma le sessioni consigliate dal Coach.'
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      const profile = getCoachProfile();
      const [events, sportsData] = await Promise.all([api.listEvents({ sortBy: 'soonest' }), api.listSports()]);
      setSports(sportsData);

      if (!profile) {
        setPlan(null);
        setLoading(false);
        return;
      }

      const weeklyPlan = getPlan(weekStart) || generatePlan({ coachProfile: profile, events, weekStart });
      setPlan(weeklyPlan);
      setLoading(false);
    }

    load();
  }, [weekStart]);

  const completed = useMemo(() => plan?.items.filter((item) => item.completed).length || 0, [plan]);

  function onComplete(itemId) {
    const next = completePlanItem({ weekStart, itemId });
    setPlan(next);
    showToast('Sessione completata', 'success');
  }

  function onReschedule(item) {
    const nextDate = new Date(item.datetime);
    nextDate.setDate(nextDate.getDate() + 1);
    const next = reschedulePlanItem({ weekStart, itemId: item.id, nextDatetime: nextDate.toISOString() });
    setPlan(next);
    showToast('Sessione riprogrammata di 1 giorno', 'info');
  }

  function onAddCustom(event) {
    event.preventDefault();
    if (!custom.title || !custom.sport_id || !custom.datetime) {
      showToast('Compila titolo, sport e data/ora', 'error');
      return;
    }

    const next = addCustomSession({
      weekStart,
      payload: { title: custom.title, sport_id: Number(custom.sport_id), datetime: custom.datetime }
    });

    setPlan(next);
    setCustom({ title: '', sport_id: '', datetime: '' });
    showToast('Sessione personalizzata aggiunta', 'success');
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  if (!plan) {
    return (
      <EmptyState
        icon={Calendar}
        imageSrc="/images/running.svg"
        imageAlt="Piano sportivo"
        title="Coach non ancora attivo"
        description="Completa il setup del Coach per generare il piano settimanale."
        primaryActionLabel="Attiva Coach"
        onPrimaryAction={() => navigate('/coach')}
      />
    );
  }

  return (
    <section className={styles.page}>
      <div className="row">
        <h1>Piano settimanale</h1>
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const prev = new Date(`${weekStart}T00:00:00`);
              prev.setDate(prev.getDate() - 7);
              setWeekStart(prev.toISOString().slice(0, 10));
            }}
          >
            Settimana precedente
          </Button>
          <Button
            type="button"
            onClick={() => {
              const next = new Date(`${weekStart}T00:00:00`);
              next.setDate(next.getDate() + 7);
              setWeekStart(next.toISOString().slice(0, 10));
            }}
          >
            Settimana successiva
          </Button>
        </div>
      </div>

      <Card>
        <p className="muted">Week start: {new Date(`${weekStart}T00:00:00`).toLocaleDateString('it-IT')}</p>
        <p>
          <strong>{completed}</strong> / {plan.targetSessions} completate
        </p>
      </Card>

      <section className="grid2">
        {plan.items.map((item) => (
          <Card key={item.id}>
            <h2 className="row">
              <Clock3 size={18} aria-hidden="true" /> {item.title}
            </h2>
            <p className="muted">{new Date(item.datetime).toLocaleString('it-IT')}</p>
            <p className="muted">Tipo: {item.type}</p>
            <div className="row">
              {!item.completed ? (
                <Button type="button" onClick={() => onComplete(item.id)} icon={CheckCircle}>
                  Segna completata
                </Button>
              ) : (
                <span>Completata</span>
              )}
              <Button type="button" variant="secondary" onClick={() => onReschedule(item)}>
                Riprogramma
              </Button>
              {item.source_event_id && <Link to={`/events/${item.source_event_id}`}>Apri evento</Link>}
            </div>
          </Card>
        ))}
      </section>

      <Card>
        <h2 className="row">
          <Plus size={18} aria-hidden="true" /> Aggiungi sessione personalizzata
        </h2>
        <form onSubmit={onAddCustom} className="stack">
          <label>
            Titolo
            <input value={custom.title} onChange={(event) => setCustom((prev) => ({ ...prev, title: event.target.value }))} />
          </label>
          <div className="grid2">
            <label>
              Sport
              <select
                value={custom.sport_id}
                onChange={(event) => setCustom((prev) => ({ ...prev, sport_id: event.target.value }))}
              >
                <option value="">Seleziona</option>
                {sports.map((sport) => (
                  <option key={sport.id} value={sport.id}>
                    {sport.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data e ora
              <input
                type="datetime-local"
                value={custom.datetime}
                onChange={(event) => setCustom((prev) => ({ ...prev, datetime: event.target.value }))}
              />
            </label>
          </div>
          <Button type="submit">Aggiungi</Button>
        </form>
      </Card>
    </section>
  );
}

export default CoachPlanPage;
