import { useEffect, useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Card from '../components/Card';

function LocalProfilePage() {
  const [profile, setProfile] = useState(null);

  usePageMeta({
    title: 'Profilo Locale | Motrice',
    description: 'Profilo locale con affidabilita simulata basata su partecipazioni e no-show.'
  });

  useEffect(() => {
    api.getLocalProfile().then(setProfile);
  }, []);

  if (!profile) {
    return <LoadingSkeleton rows={2} variant="detail" />;
  }

  return (
    <Card as="section">
      <h1>Profilo locale</h1>
      <p className="muted">Nessun login richiesto. Dati salvati localmente.</p>

      <Card subtle>
        <h2>Reliability score</h2>
        <p>
          <span
            className="tooltip"
            tabIndex={0}
            aria-describedby="reliability-help"
            title="attended / (attended + no_show + cancelled)"
          >
            {profile.reliability}%
          </span>
        </p>
        <div className="score-bar" aria-label={`Reliability score ${profile.reliability}%`}>
          <span style={{ width: `${profile.reliability}%` }} />
        </div>
        <p id="reliability-help" className="muted small">
          Formula: attended / (attended + no_show + cancelled)
        </p>
      </Card>

      <div className="stack">
        <article className="card subtle">
          <h3>Presenti</h3>
          <p>{profile.attended}</p>
        </article>
        <article className="card subtle">
          <h3>No show</h3>
          <p>{profile.no_show}</p>
        </article>
        <article className="card subtle">
          <h3>Cancellati</h3>
          <p>{profile.cancelled}</p>
        </article>
      </div>
    </Card>
  );
}

export default LocalProfilePage;
