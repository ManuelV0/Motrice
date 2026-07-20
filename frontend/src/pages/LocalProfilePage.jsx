import { useEffect, useState } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import LoadingSkeleton from '../components/LoadingSkeleton';
import Card from '../components/Card';
import Button from '../components/Button';
import { useToast } from '../context/ToastContext';

function LocalProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    display_name: '',
    bio: '',
    city: '',
    level: 'beginner',
    avatar_url: ''
  });
  const [saving, setSaving] = useState(false);

  usePageMeta({
    title: 'Profilo Locale | Motrice',
    description: 'Profilo locale con affidabilita simulata basata su partecipazioni e no-show.'
  });

  useEffect(() => {
    api.getLocalProfile().then((data) => {
      setProfile(data);
      setForm({
        display_name: String(data?.display_name || data?.name || ''),
        bio: String(data?.bio || ''),
        city: String(data?.city || ''),
        level: String(data?.level || 'beginner'),
        avatar_url: String(data?.avatar_url || '')
      });
    });
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateLocalProfile(form);
      const refreshed = await api.getLocalProfile();
      setProfile(refreshed);
      showToast('Profilo aggiornato e sincronizzato', 'success');
    } catch (error) {
      showToast(error.message || 'Impossibile aggiornare il profilo', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <LoadingSkeleton rows={2} variant="detail" />;
  }

  return (
    <Card as="section">
      <h1>Profilo personale</h1>
      <p className="muted">Questi dati accompagnano eventi, partecipazioni e messaggi.</p>

      <form className="card subtle stack" onSubmit={saveProfile}>
        <label>
          Nome visualizzato
          <input
            value={form.display_name}
            onChange={(event) => updateField('display_name', event.target.value)}
            minLength={2}
            maxLength={40}
            required
          />
        </label>
        <label>
          Bio
          <textarea
            value={form.bio}
            onChange={(event) => updateField('bio', event.target.value)}
            maxLength={600}
            rows={4}
            placeholder="Racconta come ti piace allenarti"
          />
        </label>
        <label>
          Citta
          <input
            value={form.city}
            onChange={(event) => updateField('city', event.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          Livello
          <select value={form.level} onChange={(event) => updateField('level', event.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>
          URL avatar
          <input
            type="url"
            value={form.avatar_url}
            onChange={(event) => updateField('avatar_url', event.target.value)}
            placeholder="https://..."
          />
        </label>
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva profilo'}
        </Button>
      </form>

      <Card subtle>
        <h2>Affidabilita</h2>
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
