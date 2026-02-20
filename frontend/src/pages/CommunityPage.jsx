import { ChevronLeft, Shield, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/community.module.css';

function CommunityPage() {
  const navigate = useNavigate();
  const [metPeopleCount, setMetPeopleCount] = useState(0);
  const [accessType, setAccessType] = useState('semi-private');
  const [inviteCode, setInviteCode] = useState('');

  usePageMeta({
    title: 'Community | Motrice',
    description: 'Community Motrice con regole di accesso e CTA coerenti.'
  });

  useEffect(() => {
    let active = true;
    api.listMetPeople()
      .then((items) => {
        if (!active) return;
        setMetPeopleCount(Array.isArray(items) ? items.length : 0);
      })
      .catch(() => {
        if (active) setMetPeopleCount(0);
      });

    return () => {
      active = false;
    };
  }, []);

  const isMember = metPeopleCount >= 3;

  const gateText = useMemo(() => {
    if (accessType === 'public') return 'Puoi richiedere accesso';
    if (accessType === 'private') return 'Solo su invito';
    return 'Richiedi accesso dopo 1 evento completato (check-in)';
  }, [accessType]);

  function renderPrimaryAction() {
    if (isMember) {
      return <Button type="button">Apri community</Button>;
    }
    if (accessType === 'public') {
      return <Button type="button">Richiedi accesso</Button>;
    }
    if (accessType === 'private') {
      return (
        <div className={styles.inviteWrap}>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Codice invito"
            aria-label="Inserisci codice invito"
          />
          <Button type="button" variant="secondary" disabled={!String(inviteCode).trim()}>Invia</Button>
        </div>
      );
    }
    return (
      <Button type="button" disabled={metPeopleCount < 1}>
        {metPeopleCount < 1 ? 'Partecipa a un evento per sbloccare' : 'Richiedi accesso'}
      </Button>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/chat')} aria-label="Torna alla chat hub">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div>
          <h1><Users size={18} aria-hidden="true" /> Community Motrice</h1>
          <p className="muted">Spazio community con accesso regolato.</p>
        </div>
      </header>

      <article className={styles.hero}>
        <p className={styles.accessBadge}><Shield size={14} aria-hidden="true" /> {accessType === 'public' ? 'Pubblica' : accessType === 'private' ? 'Privata' : 'Semi-privata'}</p>
        <p>{gateText}</p>
        <div className={styles.controls}>
          <label>
            Accesso
            <select value={accessType} onChange={(event) => setAccessType(event.target.value)} aria-label="Tipo accesso community">
              <option value="public">Pubblica</option>
              <option value="semi-private">Semi-privata</option>
              <option value="private">Privata</option>
            </select>
          </label>
        </div>
        <div className={styles.cta}>{renderPrimaryAction()}</div>
      </article>

      <details className={styles.accordion} open>
        <summary>Regole community</summary>
        <ul>
          <li>Rispetta i partecipanti e usa linguaggio corretto.</li>
          <li>Niente spam o promo aggressive.</li>
          <li>Condividi solo contenuti utili al gruppo sportivo.</li>
        </ul>
      </details>

      <section className={styles.block}>
        <h2>Eventi community</h2>
        <p className="muted">Nessun evento community disponibile al momento.</p>
      </section>

      <section className={styles.block}>
        <h2>Membri</h2>
        <p className="muted">Anteprima membri disponibile dopo accesso.</p>
      </section>
    </section>
  );
}

export default CommunityPage;
