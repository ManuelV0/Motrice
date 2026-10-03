import { ArrowLeft, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PostEventUserFeedback from '../components/event/PostEventUserFeedback';
import { usePageMeta } from '../hooks/usePageMeta';
import styles from '../styles/pages/eventFeedbackPage.module.css';

function EventFeedbackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [targetCount, setTargetCount] = useState(null);

  usePageMeta({
    title: 'Valuta i partecipanti · Motrice',
    description: 'Feedback verificato dopo l’evento Motrice'
  });

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate(-1)} aria-label="Torna indietro">
          <ArrowLeft size={21} aria-hidden="true" />
        </button>
        <div>
          <small>DOPO L’ALLENAMENTO</small>
          <strong>Valuta i partecipanti</strong>
        </div>
        <span><Sparkles size={15} aria-hidden="true" /> +25 XP</span>
      </header>

      <main className={styles.content}>
        <section className={styles.intro}>
          <span><ShieldCheck size={21} aria-hidden="true" /></span>
          <div>
            <strong>Solo presenze verificate</strong>
            <p>Valuta una persona alla volta. Puoi saltare chi non hai conosciuto abbastanza.</p>
          </div>
        </section>
        <PostEventUserFeedback
          eventId={id}
          enabled
          bonusXp={25}
          onTargetsChange={(targets) => setTargetCount(targets.filter((target) => !target.reviewed).length)}
        />
        {targetCount === 0 ? (
          <section className={styles.emptyState}>
            <UsersRound size={24} aria-hidden="true" />
            <strong>Nessuna valutazione da completare</strong>
            <p>Non risultano altre presenze verificate oppure hai già inviato tutti i feedback.</p>
            <button type="button" onClick={() => navigate(`/events/${id}`)}>Torna all’evento</button>
          </section>
        ) : null}
      </main>
    </section>
  );
}

export default EventFeedbackPage;
