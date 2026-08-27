import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  MoreHorizontal,
  Pencil,
  Star,
  WalletCards
} from 'lucide-react';
import styles from '../../styles/components/motriceProfileV2.module.css';

const DEMO = {
  name: 'Alessandro',
  city: 'Ascoli Piceno',
  memberSince: 'Mar 2024',
  mot: 420,
  reliability: 94,
  attended: 43,
  noShow: 2,
  lateCancellations: 1,
  rating: '4,8',
  ratingsCount: 27,
  hostedEvents: 12,
  hostedParticipants: 118,
  xp: 6850,
  level: 18,
  nextLevel: 19,
  xpToNext: 1150
};

const RATING_DETAILS = [
  ['Puntualità', 96],
  ['Impegno', 94],
  ['Collaborazione', 98],
  ['Correttezza', 95],
  ['Atteggiamento', 97]
];

const ACHIEVEMENTS = [
  { icon: '🔥', title: 'Costante', copy: 'Streak 7 giorni' },
  { icon: '⚡', title: 'Early', copy: 'Sempre puntuale' },
  { icon: '🤝', title: 'Team Player', copy: 'Top collaboratore' },
  { icon: '🏅', title: 'Host', copy: '12 eventi creati' }
];

const RECENT_ACTIVITY = [
  { title: 'Running — Ascoli Piceno · 2gg fa', copy: 'Check-in QR verificato · 20 MOT', highlighted: true },
  { title: 'Calisthenics — Porta Romana · 5gg fa', copy: '40 MOT · Spot verificato' },
  { title: 'Calcio — Ascoli Piceno · 8gg fa', copy: '30 MOT' }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function MotriceProfileV2({
  profile,
  isOwner = false,
  initialView = isOwner ? 'mine' : 'public',
  publicActionLabel = 'VISUALIZZA EVENTO',
  onPublicAction
}) {
  const navigate = useNavigate();
  const [view, setView] = useState(initialView);
  const [showRatingDetails, setShowRatingDetails] = useState(false);
  const isMine = isOwner && view === 'mine';
  const isPublic = !isMine;

  const identity = useMemo(() => {
    const profileName = String(profile?.display_name || profile?.name || '').trim();
    const name = !profileName || /^(me|tu)$/i.test(profileName) ? DEMO.name : profileName;
    const rawReliability = Number(profile?.reliability ?? profile?.reliability_score);
    return {
      name,
      initial: name.charAt(0).toUpperCase(),
      city: String(profile?.city || DEMO.city),
      reliability: clamp(rawReliability > 0 ? rawReliability : DEMO.reliability, 0, 100),
      attended: Number(profile?.attended || DEMO.attended),
      noShow: Number(profile?.no_show || profile?.no_show_count || DEMO.noShow),
      lateCancellations: Number(profile?.cancelled || DEMO.lateCancellations)
    };
  }, [profile]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('profile-v2-active');
    root.classList.toggle('profile-public-preview', isPublic);
    return () => {
      root.classList.remove('profile-v2-active');
      root.classList.remove('profile-public-preview');
    };
  }, [isPublic]);

  function handlePublicAction() {
    if (onPublicAction) {
      onPublicAction();
      return;
    }
    navigate('/agenda');
  }

  return (
    <main className={`${styles.page} ${isPublic ? styles.publicPage : ''}`}>
      <header className={styles.topbar}>
        <div>
          <span className={styles.topbarKicker}>PROFILO</span>
          <h1>{isOwner ? 'Il tuo profilo Motrice' : 'Profilo Motrice'}</h1>
        </div>
        <div className={styles.topbarActions}>
          {isOwner ? (
            <button type="button" aria-label="Modifica profilo" onClick={() => navigate('/profile/me')}>
              <Pencil size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" aria-label="Altre opzioni profilo">
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.liveLine}><span /> Live verificato</div>

      {isOwner ? (
        <div className={styles.viewToggle} role="group" aria-label="Visibilità profilo">
          <button
            type="button"
            className={isMine ? styles.viewActive : ''}
            aria-pressed={isMine}
            onClick={() => setView('mine')}
          >
            Mio profilo
          </button>
          <button
            type="button"
            className={isPublic ? styles.viewActive : ''}
            aria-pressed={isPublic}
            onClick={() => setView('public')}
          >
            Profilo pubblico
          </button>
        </div>
      ) : (
        <div className={`${styles.viewToggle} ${styles.publicOnlyToggle}`}>
          <span>Profilo pubblico</span>
        </div>
      )}

      <section className={`${styles.card} ${styles.identityCard}`} aria-labelledby="profile-name">
        <div className={styles.identityTop}>
          <div className={styles.avatar} aria-label={`Avatar di ${identity.name}`}>
            {identity.initial}
            <span className={styles.onlineDot} aria-label="Online" />
          </div>
          <div className={styles.identityCopy}>
            <div className={styles.nameLine}>
              <h2 id="profile-name">{identity.name}</h2>
              <span className={styles.reliableBadge}><i /> AFFIDABILE</span>
            </div>
            <p>📍 {identity.city} · Lv 6</p>
            <div className={styles.sports}>
              <span>Calisthenics</span>
              <span>Running</span>
            </div>
          </div>
        </div>

        {isMine ? (
          <button type="button" className={styles.editProfile} onClick={() => navigate('/profile/me')}>
            Modifica profilo
          </button>
        ) : null}

        <div className={styles.identityStats}>
          <article><span>DAL</span><strong>{DEMO.memberSince}</strong></article>
          <article><span>VERIFICATO</span><strong><Check size={17} /> Check-in QR</strong></article>
          <article className={styles.motMini}><span>MOT</span><strong>{DEMO.mot}</strong></article>
        </div>
      </section>

      <section className={`${styles.card} ${styles.reliabilityCard}`}>
        <span className={styles.label}>AFFIDABILITÀ</span>
        <div className={styles.reliabilityHero}>
          <div><strong>{identity.reliability}%</strong><span>Profilo affidabile</span></div>
          <div
            className={styles.scoreRing}
            style={{ '--score-angle': `${identity.reliability * 3.6}deg` }}
            aria-label={`Affidabilità ${identity.reliability}%`}
          >
            <b>{identity.reliability}%</b>
          </div>
        </div>
        <div className={styles.reliabilityStats}>
          <article><strong>{identity.attended}</strong><span>PRESENTI</span></article>
          <article><strong>{identity.noShow}</strong><span>NO-SHOW</span></article>
          <article><strong>{identity.lateCancellations}</strong><span>CANCELLAZIONI<br />TARDIVE</span></article>
        </div>
        <button type="button" className={styles.howCalculated}>Come viene calcolata?</button>
      </section>

      <section className={`${styles.card} ${styles.motCard}`}>
        <div className={styles.motHeader}>
          <div>
            <span className={styles.label}>MOT — PRESENZA REALE</span>
            <div className={styles.motValue}><strong>{DEMO.mot}</strong><b>MOT</b><span>MOT ≠ XP</span></div>
          </div>
          <div className={styles.verifiedCheck}><Check size={29} strokeWidth={3} /></div>
        </div>
        <p className={styles.cardDescription}>Presenze sportive verificate tramite check-in QR. MOT è prova di presenza reale.</p>
        <span className={styles.label}>ATTIVITÀ PRINCIPALI</span>
        <div className={styles.motActivities}>
          <div><span>📍 Porta Romana</span><strong>120 MOT</strong></div>
          <div><span>🏋️ Palestra X</span><strong>80 MOT</strong></div>
          <div><span>🏃 Running</span><strong>60 MOT</strong></div>
          <div className={styles.otherMot}><em>+160 MOT da altre presenze</em><span>· 14 spot</span></div>
        </div>
        <p className={styles.distinction}><strong>MOT ≠ XP:</strong> MOT dimostra presenze reali; XP misura la progressione nell’app.</p>
      </section>

      <section className={`${styles.card} ${styles.ratingsCard}`}>
        <div className={styles.ratingsHead}>
          <div>
            <span className={styles.label}>VALUTAZIONI</span>
            <strong className={styles.ratingValue}>{DEMO.rating} / 5 <Star size={26} fill="#ffc83d" color="#ffc83d" /></strong>
          </div>
          <button type="button" onClick={() => setShowRatingDetails((current) => !current)} aria-expanded={showRatingDetails}>
            {showRatingDetails ? 'Nascondi' : 'Vedi dettaglio'}
            {showRatingDetails ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
        <p><strong>{DEMO.ratingsCount} valutazioni verificate</strong> · Solo da partecipanti verificati</p>
        {showRatingDetails ? (
          <div className={styles.ratingDetails}>
            {RATING_DETAILS.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <i><b style={{ width: `${value}%` }} /></i>
                <strong>{String(value / 20).replace('.', ',')}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.hostCard}`}>
        <div className={styles.hostHead}>
          <span className={styles.label}>ESPERIENZA HOST</span>
          <span>ORGANIZZATORE</span>
        </div>
        <div className={styles.hostStats}>
          <div><strong>{DEMO.hostedEvents}</strong><span>EVENTI ORGANIZZATI</span></div>
          <div><strong>{DEMO.hostedParticipants}</strong><span>PARTECIPANTI</span></div>
        </div>
        <div className={styles.hostRows}>
          <p>👤 Come partecipante: <strong>94% affidabile</strong></p>
          <p><b>H</b> Come organizzatore: <strong>96% eventi completati · 4,9/5</strong></p>
        </div>
      </section>

      {isMine ? (
        <section className={`${styles.card} ${styles.creditCard}`}>
          <div className={styles.creditHead}>
            <div><WalletCards size={20} /><span className={styles.label}>CREDITO MOTRICE</span></div>
            <strong>40€</strong>
          </div>
          <div className={styles.creditStats}>
            <div><span>Disponibili</span><strong>20€</strong></div>
            <div><span>Bloccati</span><strong>20€</strong></div>
          </div>
          <p>Credito per partecipare. Gestito nel Wallet.</p>
        </section>
      ) : null}

      <section className={`${styles.card} ${styles.xpCard}`}>
        <div className={styles.levelBadge}>{DEMO.level}</div>
        <div className={styles.xpCopy}>
          <span className={styles.label}>LIVELLO · XP</span>
          <strong>{DEMO.xp.toLocaleString('it-IT')} XP · Lv {DEMO.level}</strong>
          <div className={styles.xpProgress}><i /></div>
          <p>{DEMO.xpToNext.toLocaleString('it-IT')} XP al Lv {DEMO.nextLevel}</p>
          <small>XP = progressione, non affidabilità.</small>
        </div>
      </section>

      <section className={`${styles.card} ${styles.achievementCard}`}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.label}>ACHIEVEMENT</span>
          <button type="button">Tutti gli achievement →</button>
        </div>
        <div className={styles.achievementGrid}>
          {ACHIEVEMENTS.map((item) => (
            <article key={item.title}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.copy}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.card} ${styles.activityCard}`}>
        <span className={styles.label}>ATTIVITÀ RECENTE</span>
        <div className={styles.timeline}>
          {RECENT_ACTIVITY.map((item) => (
            <article key={item.title} className={item.highlighted ? styles.activityHighlighted : ''}>
              <span><CircleCheckBig size={18} /></span>
              <div><strong>{item.title}</strong><p>{item.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      {isPublic ? (
        <div className={styles.publicAction}>
          <button type="button" onClick={handlePublicAction}>{publicActionLabel}</button>
        </div>
      ) : null}
    </main>
  );
}

export default MotriceProfileV2;
