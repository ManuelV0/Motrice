import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Award, CheckCircle, XCircle, MinusCircle, Gift, UserCheck, TrendingUp } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import LoadingSkeleton from '../components/LoadingSkeleton';
import styles from '../styles/pages/accountXp.module.css';

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function getTimelineIcon(type) {
  if (type === 'attendance_confirmed') return { Icon: CheckCircle, dotClass: styles.timelineDotPositive };
  if (type === 'attendance_no_show') return { Icon: XCircle, dotClass: styles.timelineDotNegative };
  if (type === 'cancel_late') return { Icon: MinusCircle, dotClass: styles.timelineDotNegative };
  if (type === 'voucher_redeemed') return { Icon: Gift, dotClass: styles.timelineDotPositive };
  if (type === 'coach_checkin') return { Icon: UserCheck, dotClass: styles.timelineDotPositive };
  return { Icon: TrendingUp, dotClass: '' };
}

function formatXpHistoryLabel(item) {
  const type = String(item?.type || '');
  if (type === 'attendance_confirmed') return 'Presenza evento confermata';
  if (type === 'attendance_no_show') return 'No-show evento';
  if (type === 'cancel_late') return 'Cancellazione tardiva';
  if (type === 'voucher_redeemed') return 'Voucher convenzione riscattato';
  if (type === 'coach_checkin') return 'Check-in coach registrato';
  return 'Aggiornamento XP';
}

function AccountXpPage() {
  const [loading, setLoading] = useState(true);
  const [xpState, setXpState] = useState(null);
  const [profile, setProfile] = useState({ reliability: 0, attended: 0, no_show: 0, cancelled: 0 });
  const [sportsCatalog, setSportsCatalog] = useState([]);
  const [showAllSport, setShowAllSport] = useState(false);

  usePageMeta({ title: 'XP & Badge | Motrice', description: 'Progressione XP, badge e reputazione.' });

  useEffect(() => {
    let active = true;
    async function hydrate() {
      setLoading(true);
      const [xpRes, profileRes, sportsRes] = await Promise.allSettled([
        api.getXpState(),
        api.getLocalProfile(),
        api.listSports()
      ]);
      if (!active) return;

      if (xpRes.status === 'fulfilled') setXpState(xpRes.value);
      if (profileRes.status === 'fulfilled') {
        const d = profileRes.value;
        setProfile({
          reliability: Number(d?.reliability || d?.reliability_score || 0),
          attended: Number(d?.attended || 0),
          no_show: Number(d?.no_show || 0),
          cancelled: Number(d?.cancelled || 0)
        });
      }
      if (sportsRes.status === 'fulfilled') setSportsCatalog(sportsRes.value);
      setLoading(false);
    }
    hydrate();
    return () => { active = false; };
  }, []);

  const sportLabels = useMemo(() => {
    const next = { generic: 'Generic', fitness: 'Fitness' };
    sportsCatalog.forEach((sport) => {
      next[String(sport.id).toLowerCase()] = sport.name;
      next[String(sport.name || '').toLowerCase()] = sport.name;
    });
    return next;
  }, [sportsCatalog]);

  const xpSportsRows = useMemo(() => {
    if (!xpState?.xp_by_sport || typeof xpState.xp_by_sport !== 'object') return [];
    return Object.entries(xpState.xp_by_sport)
      .map(([sportId, xp]) => {
        const key = String(sportId || '').toLowerCase();
        const rawLabel = sportLabels[key] || String(sportId || 'Generic');
        return { sportId, label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1), xp: Number(xp || 0) };
      })
      .sort((a, b) => b.xp - a.xp);
  }, [sportLabels, xpState]);

  const maxSportXp = xpSportsRows.length > 0 ? xpSportsRows[0].xp : 1;
  const visibleSports = showAllSport ? xpSportsRows : xpSportsRows.slice(0, 5);
  const xpHistoryRows = Array.isArray(xpState?.xp_history) ? xpState.xp_history.slice(0, 10) : [];
  const progressPct = clamp(xpState?.progress?.progressPct ?? 0, 0, 100);
  const reliabilityPct = clamp(profile.reliability, 0, 100);
  const ringOffset = RING_CIRCUMFERENCE - (progressPct / 100) * RING_CIRCUMFERENCE;

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.backRow}>
          <Link to="/account" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Account</Link>
        </div>
        <LoadingSkeleton rows={6} variant="detail" />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/account" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Account</Link>
      </div>

      <div className={styles.heroCard}>
        <div className={styles.ringWrap}>
          <svg className={styles.ringSvg} viewBox="0 0 120 120">
            <circle className={styles.ringTrack} cx="60" cy="60" r={RING_RADIUS} />
            <circle
              className={styles.ringFill}
              cx="60"
              cy="60"
              r={RING_RADIUS}
              stroke="url(#xpGrad)"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
            />
            <defs>
              <linearGradient id="xpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--accent)" />
              </linearGradient>
            </defs>
          </svg>
          <div className={styles.ringCenter}>
            <p className={styles.ringXpValue}>{xpState?.xp_global ?? 0}</p>
            <p className={styles.ringXpLabel}>XP</p>
          </div>
        </div>

        <div className={styles.badgeCard}>
          <Award size={22} aria-hidden="true" />
          <p className={styles.badgeName}>{xpState?.badge?.label || 'Rame'}</p>
        </div>

        <p className={styles.progressHint}>
          {xpState?.progress?.nextThreshold
            ? `${xpState.progress.currentXp}/${xpState.progress.nextThreshold} verso il prossimo livello`
            : 'Livello massimo raggiunto'}
        </p>
      </div>

      <div className={styles.reliabilityWrap}>
        <p className={styles.reliabilityValue}>Affidabilita: <strong>{reliabilityPct}%</strong></p>
        <div className={styles.reliabilityBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={reliabilityPct}>
          <span style={{ width: `${reliabilityPct}%` }} />
        </div>
        <div className={styles.reliabilityMetrics}>
          <p><span>Partecipati</span><strong>{profile.attended}</strong></p>
          <p><span>No-show</span><strong>{profile.no_show}</strong></p>
          <p><span>Cancellati</span><strong>{profile.cancelled}</strong></p>
        </div>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h2>XP per sport</h2>
          {xpSportsRows.length > 5 ? (
            <button type="button" className={styles.toggleBtn} onClick={() => setShowAllSport((p) => !p)}>
              {showAllSport ? 'Mostra meno' : 'Vedi tutti'}
            </button>
          ) : null}
        </div>
        <div className={styles.barList}>
          {visibleSports.map((item, i) => {
            const pct = maxSportXp > 0 ? Math.round((item.xp / maxSportXp) * 100) : 0;
            const colorClass = styles[`barFillColor${i % 5}`] || styles.barFillColor0;
            return (
              <div key={item.sportId} className={styles.barItem}>
                <div className={styles.barLabel}>
                  <span>{item.label}</span>
                  <strong>{item.xp}</strong>
                </div>
                <div className={styles.barTrack}>
                  <span className={`${styles.barFill} ${colorClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {xpSportsRows.length === 0 ? <p className={styles.emptyBar}>Nessun XP sport disponibile.</p> : null}
        </div>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h2>Cronologia attivita</h2>
        </div>
        {xpHistoryRows.length > 0 ? (
          <div className={styles.timeline}>
            {xpHistoryRows.map((item) => {
              const points = Number(item.points || 0);
              const isPositive = points >= 0;
              const pointLabel = isPositive ? `+${points}` : `${points}`;
              const { Icon, dotClass } = getTimelineIcon(item.type);
              return (
                <div key={item.id} className={styles.timelineItem}>
                  <span className={`${styles.timelineDot} ${dotClass}`}>
                    <Icon aria-hidden="true" />
                  </span>
                  <div className={styles.timelineContent}>
                    <p className={styles.timelineTitle}>{formatXpHistoryLabel(item)}</p>
                    <div className={styles.timelineMeta}>
                      <span className={`${styles.timelinePoints} ${isPositive ? styles.timelinePointsPositive : styles.timelinePointsNegative}`}>
                        {pointLabel} XP
                      </span>
                      <span className={styles.timelineDate}>{new Date(item.ts).toLocaleDateString('it-IT')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyTimeline}>Nessuna attivita XP registrata.</p>
        )}
      </div>
    </section>
  );
}

export default AccountXpPage;
