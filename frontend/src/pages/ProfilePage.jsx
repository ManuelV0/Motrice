import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { CalendarX2, Trophy } from 'lucide-react';

function ProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  usePageMeta({
    title: profile ? `${profile.name} | Profilo Motrice` : 'Profilo | Motrice',
    description: 'Profilo pubblico atleta con sport praticati, disponibilita e affidabilita.'
  });

  useEffect(() => {
    api
      .getProfile(id)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return <EmptyState title="Profilo non trovato" description={error} imageSrc="/images/default-sport.svg" imageAlt="Sport" />;
  }

  if (!profile) {
    return <LoadingSkeleton rows={2} variant="detail" />;
  }

  return (
    <section className="card">
      <h1>{profile.name}</h1>
      <p className="muted">{profile.city}</p>
      <p>{profile.bio}</p>

      <div className="grid two">
        <article className="card subtle">
          <h2>Sport e livelli</h2>
          {profile.sports_practiced.length === 0 ? (
            <EmptyState
              icon={Trophy}
              imageSrc="/images/palestra.svg"
              imageAlt="Icona palestra"
              title="Nessuno sport configurato"
              description="Questo atleta non ha ancora aggiunto sport al profilo."
              primaryActionLabel="Explore nearby"
              onPrimaryAction={() => navigate('/explore')}
            />
          ) : (
            <ul>
              {profile.sports_practiced.map((sport) => (
                <li key={`${sport.sport_id}-${sport.level}`}>
                  {sport.sport_name} - {sport.level}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="card subtle">
          <h2>Disponibilita</h2>
          {profile.availability.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              imageSrc="/images/running.svg"
              imageAlt="Icona running"
              title="Nessuna disponibilita"
              description="Nessuna fascia oraria impostata."
              primaryActionLabel="Explore nearby"
              onPrimaryAction={() => navigate('/explore')}
            />
          ) : (
            <ul>
              {profile.availability.map((slot) => (
                <li key={`${slot.day}-${slot.start}`}>
                  {slot.day}: {slot.start} - {slot.end}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="grid two">
        <article className="card subtle">
          <h3>Goal</h3>
          <p>{profile.goal}</p>
        </article>
        <article className="card subtle">
          <h3>Reliability</h3>
          <p>{profile.reliability_score}%</p>
          <p className="muted">No show: {profile.no_show_count}</p>
        </article>
      </div>

      <button type="button" disabled aria-disabled="true" className="secondary">
        Modifica profilo (Disponibile presto)
      </button>
    </section>
  );
}

export default ProfilePage;
