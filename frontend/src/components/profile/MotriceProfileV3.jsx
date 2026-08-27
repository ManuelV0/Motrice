import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Coins,
  CreditCard,
  LockKeyhole,
  MapPin,
  Pencil,
  Save,
  ScanLine,
  ShieldCheck,
  Star,
  Trophy,
  UserRoundPlus,
  WalletCards,
  Zap
} from 'lucide-react';
import styles from '../../styles/components/profile/motriceProfileV3.module.css';

const RATING_ROWS = ['Puntualità', 'Impegno', 'Collaborazione', 'Correttezza', 'Atteggiamento'];

function euro(cents) {
  return `${(Number(cents || 0) / 100).toFixed(0)}€`;
}

function MotriceProfileV3({
  profile,
  state,
  mode,
  onModeChange,
  onSaveProfile,
  onSimulateCheckIn,
  onInvite
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [form, setForm] = useState({ display_name: '', city: '', bio: '', avatar_url: '' });

  useEffect(() => {
    setForm({
      display_name: profile?.display_name || profile?.name || 'Alessandro',
      city: profile?.city || 'Ascoli Piceno',
      bio: profile?.bio || '',
      avatar_url: profile?.avatar_url || ''
    });
  }, [profile]);

  const identity = state.identity;
  const displayName = form.display_name.trim() || identity.display_name || 'Alessandro';
  const initials = displayName.slice(0, 1).toUpperCase();
  const reliability = state.reliability;
  const walletTotal = state.credit_wallet.available_cents + state.credit_wallet.locked_cents;
  const xpProgress = Math.min(100, Math.round((state.xp.total / state.xp.next_level_at) * 100));
  const verified = Number(state.verified_checkins || reliability.present || 0);
  const isPrivate = mode === 'mine';

  const ringStyle = useMemo(
    () => ({ '--profile-v3-score': `${Math.max(0, Math.min(100, reliability.score)) * 3.6}deg` }),
    [reliability.score]
  );

  async function saveIdentity(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await onSaveProfile(form);
      if (saved !== false) setIdentityOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    setSimulating(true);
    try {
      await onSimulateCheckIn();
    } finally {
      setSimulating(false);
    }
  }

  return (
    <main className={`${styles.page} ${!isPrivate ? styles.publicMode : ''}`}>
      <header className={styles.topHeader}>
        <span>PROFILO</span>
        <p><i aria-hidden="true" /> Live verificato</p>
      </header>

      <div className={styles.modeToggle} role="tablist" aria-label="Vista del profilo">
        <button
          type="button"
          role="tab"
          aria-selected={isPrivate}
          className={isPrivate ? styles.modeActive : ''}
          onClick={() => onModeChange('mine')}
        >
          Mio profilo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isPrivate}
          className={!isPrivate ? styles.modeActive : ''}
          onClick={() => onModeChange('public')}
        >
          Profilo pubblico
        </button>
      </div>

      <section className={`${styles.card} ${styles.heroCard}`}>
        <button
          type="button"
          className={styles.heroToggle}
          aria-expanded={identityOpen}
          aria-controls="profile-v3-identity"
          onClick={() => setIdentityOpen((value) => !value)}
        >
          <span className={styles.avatarWrap}>
            {form.avatar_url ? <img src={form.avatar_url} alt="" /> : <b>{initials}</b>}
            <i aria-hidden="true" />
          </span>
          <span className={styles.heroIdentity}>
            <span className={styles.nameLine}>
              <strong>{displayName}</strong>
              <em>PREMIUM</em>
            </span>
            <span className={styles.locationLine}>
              <MapPin size={14} aria-hidden="true" /> {form.city || identity.city} · Lv {state.xp.level}
            </span>
            <span className={styles.sportPills}>
              {identity.sports.map((sport) => <small key={sport}>{sport}</small>)}
            </span>
          </span>
          <span className={styles.accordionIcon} aria-hidden="true">
            {identityOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </span>
        </button>

        <div className={styles.identityMiniGrid}>
          <article><span>DAL</span><strong>{identity.member_since}</strong></article>
          <article><span>VERIFICATO</span><strong>{verified}</strong></article>
          <article className={styles.motMini}><span>MOT</span><strong>{state.mot.total}</strong></article>
        </div>

        {identityOpen ? (
          <div id="profile-v3-identity" className={styles.identityAccordion}>
            {isPrivate ? (
              <form onSubmit={saveIdentity}>
                <div className={styles.accordionTitle}>
                  <Pencil size={16} aria-hidden="true" />
                  <div><strong>Bio e dati personali</strong><span>Unica identità per eventi e chat.</span></div>
                </div>
                <label>
                  Nome
                  <input value={form.display_name} maxLength={40} required onChange={(event) => setForm({ ...form, display_name: event.target.value })} />
                </label>
                <label>
                  Città
                  <input value={form.city} maxLength={80} onChange={(event) => setForm({ ...form, city: event.target.value })} />
                </label>
                <label className={styles.fullField}>
                  Bio
                  <textarea value={form.bio} maxLength={600} rows={4} placeholder="Racconta come ti alleni e cosa cerchi..." onChange={(event) => setForm({ ...form, bio: event.target.value })} />
                  <small>{form.bio.length}/600</small>
                </label>
                <label className={styles.fullField}>
                  Foto profilo
                  <input type="url" inputMode="url" value={form.avatar_url} placeholder="https://..." onChange={(event) => setForm({ ...form, avatar_url: event.target.value })} />
                </label>
                <button type="submit" className={styles.saveButton} disabled={saving}>
                  <Save size={17} aria-hidden="true" /> {saving ? 'Salvataggio...' : 'Salva profilo'}
                </button>
              </form>
            ) : (
              <div className={styles.publicBio}>
                <strong>Bio</strong>
                <p>{form.bio.trim() || 'Nessuna bio inserita.'}</p>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.reliabilityCard}`}>
        <div className={styles.sectionHeading}><div><span>AFFIDABILITÀ</span><h2>{reliability.score}%</h2><p>{reliability.score > 0 ? 'Profilo affidabile' : 'Da costruire'}</p></div>
          <div className={`${styles.scoreRing} ${reliability.score === 0 ? styles.scoreRingEmpty : ''}`} style={ringStyle}><strong>{reliability.score}%</strong></div>
        </div>
        <div className={styles.reliabilityStats}>
          <article><strong>{reliability.present}</strong><span>PRESENTI</span></article>
          <article><strong>{reliability.no_show}</strong><span>NO-SHOW</span></article>
          <article><strong>{reliability.late_cancellations}</strong><span>CANCELLAZIONI<br />TARDIVE</span></article>
        </div>
        <small className={styles.formula}>Presenti / esiti verificati</small>
      </section>

      <section className={`${styles.card} ${styles.motCard}`}>
        <div className={styles.cardTitleRow}>
          <div><span>MOT — PRESENZA REALE</span><h2>{state.mot.total} <small>MOT</small></h2></div>
          <CircleCheck size={38} aria-hidden="true" />
        </div>
        <span className={styles.systemBadge}>MOT ≠ XP</span>
        <p>Presenze sportive confermate dall’host tramite check-in QR.</p>
        <h3>ATTIVITÀ PRINCIPALI</h3>
        {state.mot.logs.length ? (
          <ul className={styles.logList}>
            {state.mot.logs.slice(0, 4).map((log) => (
              <li key={log.id || log.created_at}><span><ScanLine size={16} /> Check-in QR verificato</span><strong>+{log.mot} MOT</strong></li>
            ))}
          </ul>
        ) : <div className={styles.emptyRow}><ScanLine size={20} /><span>Nessuna presenza verificata</span></div>}
      </section>

      <section className={`${styles.card} ${styles.ratingsCard}`}>
        <div className={styles.cardTitleRow}>
          <div><span>VALUTAZIONI</span><h2>{state.ratings.average.toFixed(1).replace('.', ',')} / 5 <Star size={24} fill="currentColor" /></h2></div>
          <button type="button" onClick={() => setRatingsOpen((value) => !value)} aria-expanded={ratingsOpen}>
            {ratingsOpen ? 'Nascondi dettaglio' : 'Vedi dettaglio'}
          </button>
        </div>
        <p><strong>{state.ratings.verified_count} valutazioni verificate</strong> · Solo da partecipanti verificati</p>
        {ratingsOpen ? (
          <div className={styles.ratingDetails}>
            {RATING_ROWS.map((label) => <div key={label}><span>{label}</span><i><b style={{ width: '0%' }} /></i><strong>0,0</strong></div>)}
          </div>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.hostCard}`}>
        <div className={styles.hostHeader}><span>ESPERIENZA HOST</span><em>ORGANIZZATORE</em></div>
        <div className={styles.hostStats}>
          <article><strong>{state.host.events}</strong><span>EVENTI ORGANIZZATI</span></article>
          <article><strong>{state.host.participants}</strong><span>PARTECIPANTI</span></article>
        </div>
        <div className={styles.hostRows}>
          <p><ShieldCheck size={18} /> Come partecipante: <strong>{reliability.score}% affidabile</strong></p>
          <p><Trophy size={18} /> Come organizzatore: <strong>nessun evento completato</strong></p>
        </div>
      </section>

      <section className={`${styles.card} ${styles.xpCard}`}>
        <div className={styles.levelBadge}>{state.xp.level}</div>
        <div><span>LIVELLO · XP</span><h2>Lv {state.xp.level} · {state.xp.total} XP</h2><p>{Math.max(0, state.xp.next_level_at - state.xp.total)} XP al Lv {state.xp.level + 1}</p></div>
        <div className={styles.progress}><i style={{ width: `${xpProgress}%` }} /></div>
        <small>XP = progressione, non affidabilità.</small>
      </section>

      {isPrivate ? (
        <section className={`${styles.card} ${styles.walletCard}`}>
          <div className={styles.cardTitleRow}>
            <div><span>CREDITO MOTRICE</span><h2>{euro(walletTotal)} totali</h2></div>
            <WalletCards size={34} aria-hidden="true" />
          </div>
          <div className={styles.walletStats}>
            <article><CreditCard size={18} /><span>Disponibili</span><strong>{euro(state.credit_wallet.available_cents)}</strong></article>
            <article><LockKeyhole size={18} /><span>Bloccati</span><strong>{euro(state.credit_wallet.locked_cents)}</strong></article>
          </div>
          <p>Credito per partecipare. La prenotazione sposta il saldo da disponibile a bloccato.</p>
        </section>
      ) : null}

      <section className={`${styles.card} ${styles.achievementsCard}`}>
        <div className={styles.cardTitleRow}><span>ACHIEVEMENT</span><small>4 obiettivi</small></div>
        <div className={styles.achievementGrid}>
          {state.achievements.slice(0, 4).map((item) => (
            <article key={item.id} aria-label={`${item.label}, bloccato`}>
              <i>{item.icon}</i><strong>{item.label}</strong><span>{item.detail}</span><LockKeyhole size={13} />
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.card} ${styles.activityCard}`}>
        <span>ATTIVITÀ RECENTE</span>
        {state.recent_activity.length ? (
          <ul>
            {state.recent_activity.map((item) => <li key={item.id}><CircleCheck size={22} /><div><strong>{item.title}</strong><p>{item.subtitle}</p></div></li>)}
          </ul>
        ) : <div className={styles.activityEmpty}><Zap size={20} /><p>Nessuna attività recente</p></div>}
      </section>

      <section className={styles.legend} aria-label="Legenda sistemi Motrice">
        <h2>Tre sistemi, tre funzioni</h2>
        <p><CreditCard size={16} /><strong>CREDITO</strong><span>partecipazione</span></p>
        <p><Coins size={16} /><strong>MOT</strong><span>presenza QR</span></p>
        <p><Zap size={16} /><strong>XP</strong><span>progressione</span></p>
      </section>

      {isPrivate ? (
        <button type="button" className={styles.demoButton} disabled={simulating || state.demo_used} onClick={simulate}>
          <ScanLine size={19} aria-hidden="true" />
          {state.demo_used ? 'Check-in demo completato' : simulating ? 'Simulazione...' : 'Simula Check-in QR'}
        </button>
      ) : (
        <div className={styles.publicSticky}>
          <button type="button" onClick={onInvite}><UserRoundPlus size={20} /> INVITA AD EVENTO</button>
        </div>
      )}
    </main>
  );
}

export default MotriceProfileV3;
