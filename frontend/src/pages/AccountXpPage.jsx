import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CheckCircle,
  ChevronRight,
  Gift,
  LockKeyhole,
  MapPinCheck,
  MinusCircle,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  XCircle
} from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import LoadingSkeleton from '../components/LoadingSkeleton';
import XpProgressBar from '../features/xp/components/XpProgressBar';
import { XP_EARNING_RULES, getXpTierProgress } from '../features/xp/xpMarketplaceConfig';
import { useXpProgression } from '../features/xp/useXpProgression';
import styles from '../styles/pages/accountXp.module.css';

const numberFormatter = new Intl.NumberFormat('it-IT');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function getTimelineIcon(type) {
  if (type === 'attendance_confirmed') return { Icon: CheckCircle, dotClass: styles.timelineDotPositive };
  if (type === 'attendance_no_show') return { Icon: XCircle, dotClass: styles.timelineDotNegative };
  if (type === 'cancel_late') return { Icon: MinusCircle, dotClass: styles.timelineDotNegative };
  if (type === 'voucher_redeemed') return { Icon: Gift, dotClass: styles.timelineDotPositive };
  if (type === 'coach_checkin' || type === 'event_checkin_organizer') {
    return { Icon: UserCheck, dotClass: styles.timelineDotPositive };
  }
  if (type === 'event_created') return { Icon: Award, dotClass: styles.timelineDotPositive };
  return { Icon: TrendingUp, dotClass: '' };
}

function formatXpHistoryLabel(item) {
  const explicitLabel = String(item?.label || item?.motivo || '').trim();
  if (explicitLabel) return explicitLabel;
  const type = String(item?.type || '');
  if (type === 'attendance_confirmed') return 'Presenza evento confermata';
  if (type === 'attendance_no_show') return 'No-show evento';
  if (type === 'cancel_late') return 'Cancellazione tardiva';
  if (type === 'voucher_redeemed') return 'Voucher convenzione riscattato';
  if (type === 'coach_checkin') return 'Check-in coach registrato';
  if (type === 'event_created') return 'Evento creato';
  if (type === 'event_checkin_organizer') return 'Check-in partecipante validato';
  return 'Aggiornamento XP';
}

function formatVerification(item) {
  const text = `${item?.label || ''} ${item?.motivo || ''} ${item?.type || ''}`.toLowerCase();
  if (text.includes('qr')) return 'QR verificato';
  if (text.includes('gps') || text.includes('posizione')) return 'GPS verificato';
  if (text.includes('questionario') || text.includes('valutaz')) return 'Questionario completato';
  return 'Attività verificata';
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayKey = (item) => `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  if (dayKey(date) === dayKey(today)) return 'OGGI';
  if (dayKey(date) === dayKey(yesterday)) return 'IERI';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }).toUpperCase();
}

function EarningIcon({ id }) {
  if (id === 'participant-qr') return <QrCode aria-hidden="true" />;
  if (id === 'participant-gps') return <MapPinCheck aria-hidden="true" />;
  if (id === 'organizer') return <UserCheck aria-hidden="true" />;
  return <Award aria-hidden="true" />;
}

function AccountXpPage() {
  const { loading, error, xpState, profileStats: profile, sportsCatalog } = useXpProgression();
  const [showAllSport, setShowAllSport] = useState(false);

  usePageMeta({
    title: 'Progressione XP | Motrice',
    description: 'Livello personale, gradi, sblocchi e storico XP Motrice.'
  });

  const sportLabels = useMemo(() => {
    const next = { generic: 'Generale', fitness: 'Fitness' };
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
        const rawLabel = sportLabels[key] || String(sportId || 'Generale');
        return { sportId, label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1), xp: Number(xp || 0) };
      })
      .sort((a, b) => b.xp - a.xp);
  }, [sportLabels, xpState]);

  const xpTotal = Number(xpState?.xp_global || 0);
  const level = Number(xpState?.progress?.level || Math.floor(xpTotal / 250) + 1);
  const nextLevelAt = Number(xpState?.progress?.nextThreshold || level * 250);
  const levelRemaining = Math.max(0, nextLevelAt - xpTotal);
  const grade = getXpTierProgress(xpTotal);
  const activeGrade = grade.currentTier || grade.focusTier;
  const gradeTarget = grade.nextTier || grade.currentTier;
  const reliabilityPct = clamp(profile.reliability, 0, 100);
  const maxSportXp = xpSportsRows.length > 0 ? xpSportsRows[0].xp : 1;
  const visibleSports = showAllSport ? xpSportsRows : xpSportsRows.slice(0, 5);
  const xpHistoryRows = Array.isArray(xpState?.xp_history) ? xpState.xp_history.slice(0, 20) : [];

  if (loading) {
    return (
      <section className={styles.page}>
        <div className={styles.backRow}>
          <Link to="/account" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Account</Link>
        </div>
        <LoadingSkeleton rows={7} variant="detail" />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/account" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Account</Link>
      </div>

      <header className={styles.progressHero}>
        <div className={styles.heroHeading}>
          <div>
            <p>PROGRESSIONE PERSONALE</p>
            <h1>{numberFormatter.format(xpTotal)} <span>XP</span></h1>
          </div>
          {xpState?.source === 'supabase' ? (
            <span className={styles.syncBadge}><ShieldCheck size={15} /> Sincronizzati</span>
          ) : null}
        </div>

        <div className={styles.levelOverview}>
          <div><span>Livello attuale</span><strong>LV {level}</strong></div>
          <div><span>Prossimo livello</span><strong>{numberFormatter.format(nextLevelAt)} XP</strong></div>
        </div>

        <XpProgressBar
          value={xpTotal - Number(xpState?.progress?.currentThreshold || 0)}
          max={250}
          label={`Progresso livello ${level}`}
        />
        <div className={styles.progressLabels}>
          <span>{numberFormatter.format(xpTotal)} / {numberFormatter.format(nextLevelAt)} XP</span>
          <strong>{numberFormatter.format(levelRemaining)} XP al prossimo livello</strong>
        </div>
      </header>

      <section className={styles.gradeCard} style={{ '--grade-color': activeGrade.color }}>
        <div className={styles.gradeHeader}>
          <div>
            <span>{grade.currentTier ? 'GRADO ATTUALE' : 'PRIMO GRADO'}</span>
            <h2>{activeGrade.label}</h2>
          </div>
          <span className={`${styles.gradeState} ${grade.currentTier ? styles.gradeStateUnlocked : ''}`}>
            {grade.currentTier ? <CheckCircle size={15} /> : <LockKeyhole size={15} />}
            {grade.currentTier ? 'SBLOCCATO' : 'BLOCCATO'}
          </span>
        </div>

        {gradeTarget ? (
          <div className={styles.gradeProgress}>
            <div>
              <span>{grade.currentTier && grade.nextTier ? `Prossimo obiettivo · ${gradeTarget.label}` : 'Verso lo sblocco'}</span>
              <strong>{numberFormatter.format(xpTotal)} / {numberFormatter.format(gradeTarget.requiredXp)} XP</strong>
            </div>
            <XpProgressBar value={xpTotal} max={gradeTarget.requiredXp} label={`Progresso grado ${gradeTarget.label}`} color={gradeTarget.color} />
            <p>{grade.nextTier ? `${numberFormatter.format(grade.remainingXp)} XP al prossimo grado` : 'Hai sbloccato tutti i gradi del Marketplace XP'}</p>
          </div>
        ) : null}
      </section>

      <Link className={styles.marketplaceCta} to="/marketplace">
        <span className={styles.marketplaceIcon}><ShoppingBag aria-hidden="true" /></span>
        <span>
          <small>MARKETPLACE XP</small>
          <strong>Il tuo impegno sblocca il tuo stile</strong>
          <em>Tutti i capi sono visibili. Gli XP non vengono spesi.</em>
        </span>
        <ChevronRight aria-hidden="true" />
      </Link>

      {error ? <p className={styles.errorState}>{error}</p> : null}

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div><span>GUIDA RAPIDA</span><h2>Come guadagnare XP</h2></div>
        </div>
        <p className={styles.sectionIntro}>Gli XP vengono accreditati solo dopo il completamento o la verifica dell’attività, mai alla semplice iscrizione.</p>
        <div className={styles.earningGrid}>
          {XP_EARNING_RULES.map((rule) => (
            <article key={rule.id} className={styles.earningCard}>
              <span><EarningIcon id={rule.id} /></span>
              <div><strong>{rule.title}</strong><small>{rule.detail}</small></div>
              <b>{rule.prefix ? `${rule.prefix} ` : ''}+{rule.xp} XP</b>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.reliabilityWrap}>
        <div className={styles.sectionHeader}>
          <div><span>AFFIDABILITÀ</span><h2>Presenza e continuità</h2></div>
          <strong>{reliabilityPct}%</strong>
        </div>
        <div className={styles.reliabilityBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={reliabilityPct}>
          <span style={{ width: `${reliabilityPct}%` }} />
        </div>
        <div className={styles.reliabilityMetrics}>
          <p><span>Partecipati</span><strong>{profile.attended}</strong></p>
          <p><span>No-show</span><strong>{profile.no_show}</strong></p>
          <p><span>Cancellati</span><strong>{profile.cancelled}</strong></p>
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div><span>DISTRIBUZIONE</span><h2>XP per sport</h2></div>
          {xpSportsRows.length > 5 ? (
            <button type="button" className={styles.toggleBtn} onClick={() => setShowAllSport((current) => !current)}>
              {showAllSport ? 'Mostra meno' : 'Vedi tutti'}
            </button>
          ) : null}
        </div>
        <div className={styles.barList}>
          {visibleSports.map((item, index) => {
            const pct = maxSportXp > 0 ? Math.round((item.xp / maxSportXp) * 100) : 0;
            const colorClass = styles[`barFillColor${index % 5}`] || styles.barFillColor0;
            return (
              <div key={item.sportId} className={styles.barItem}>
                <div className={styles.barLabel}><span>{item.label}</span><strong>{numberFormatter.format(item.xp)} XP</strong></div>
                <div className={styles.barTrack}><span className={`${styles.barFill} ${colorClass}`} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          {xpSportsRows.length === 0 ? <p className={styles.emptyBar}>Nessun XP sport disponibile.</p> : null}
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div><span>ATTIVITÀ VERIFICATE</span><h2>Storico XP</h2></div>
        </div>
        {xpHistoryRows.length > 0 ? (
          <div className={styles.timeline}>
            {xpHistoryRows.map((item) => {
              const points = Number(item.points || 0);
              const isPositive = points >= 0;
              const { Icon, dotClass } = getTimelineIcon(item.type);
              return (
                <article key={item.id} className={styles.timelineItem}>
                  <time>{formatHistoryDate(item.ts)}</time>
                  <span className={`${styles.timelineDot} ${dotClass}`}><Icon aria-hidden="true" /></span>
                  <div className={styles.timelineContent}>
                    <p className={styles.timelineTitle}>{formatXpHistoryLabel(item)}</p>
                    <span>{formatVerification(item)}</span>
                  </div>
                  <strong className={`${styles.timelinePoints} ${isPositive ? styles.timelinePointsPositive : styles.timelinePointsNegative}`}>
                    {isPositive ? '+' : ''}{numberFormatter.format(points)} XP
                  </strong>
                </article>
              );
            })}
          </div>
        ) : <p className={styles.emptyTimeline}>Nessuna attività XP registrata.</p>}
      </section>
    </section>
  );
}

export default AccountXpPage;
