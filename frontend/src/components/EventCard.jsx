import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Clock3,
  MapPin,
  ShieldCheck,
  Users
} from 'lucide-react';
import Card from './Card';
import { getSportHeroImage } from '../utils/sportImages';
import styles from '../styles/components/eventCard.module.css';

function formatEventDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return { day: 'Data da definire', time: '--:--' };
  return {
    day: new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date),
    time: new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(date)
  };
}

function resolveStatus(event, status) {
  if (status?.label) return status;
  if (event.status === 'cancelled') return { label: 'Annullato', tone: 'danger' };
  if (event.status === 'completed') return { label: 'Svolto', tone: 'neutral' };
  if (event.is_going) return { label: 'Partecipo', tone: 'success' };
  if (event.featured_boost) return { label: 'In evidenza', tone: 'success' };
  return null;
}

function EventCard({
  event,
  variant = 'standard',
  context = 'default',
  status,
  selected = false,
  stats = [],
  metaItems,
  primaryAction,
  secondaryAction,
  detailsLabel = 'Dettagli',
  detailsIconOnly = false,
  onSelect,
  onToggleSave,
  onBookGroup,
  saving = false,
  booking = false,
  showProgress,
  showDescription = false,
  linkTarget,
  className = ''
}) {
  const visualVariant = variant === 'folder' ? 'featured' : variant === 'expanded' ? 'featured' : variant;
  const safeVariant = ['compact', 'standard', 'featured'].includes(visualVariant) ? visualVariant : 'standard';
  const date = formatEventDate(event.event_datetime);
  const resolvedStatus = resolveStatus(event, status);
  const StatusIcon = resolvedStatus?.icon;
  const PrimaryIcon = primaryAction?.icon;
  const SecondaryIcon = secondaryAction?.icon;
  const participants = Math.max(0, Number(event.participants_count || 0));
  const capacity = Math.max(participants, Number(event.max_participants || 0));
  const displayProgress = showProgress ?? safeVariant !== 'compact';
  const defaultMetaItems = [
    event.duration_minutes ? { icon: Clock3, label: `${Number(event.duration_minutes)} min` } : null,
    capacity ? { icon: Users, label: `${participants}/${capacity}` } : null,
    event.created_by === 'me' ? { icon: ShieldCheck, label: 'Organizer' } : null
  ].filter(Boolean);
  const renderedMetaItems = Array.isArray(metaItems) ? metaItems : defaultMetaItems;
  const hasActions = Boolean(primaryAction || secondaryAction || onBookGroup || detailsLabel);
  const title = event.title || event.sport_name || 'Evento Motrice';
  const location = event.location_name || event.city || 'Luogo da definire';
  const detailHref = `/events/${event.id}`;

  const mainContent = (
    <>
      <span className={styles.imageWrap} aria-hidden="true">
        <img
          className={styles.image}
          src={getSportHeroImage(event.sport_name, event.title)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(imageEvent) => {
            imageEvent.currentTarget.src = '/images/hero-sport-default-v2.jpg';
          }}
        />
        <span className={styles.imageShade} />
        <span className={styles.sportBadge}>{event.sport_name || 'Sport'}</span>
        {resolvedStatus ? (
          <span className={`${styles.stateBadge} ${styles[`state_${resolvedStatus.tone || 'neutral'}`]}`}>
            {StatusIcon ? <StatusIcon size={13} aria-hidden="true" /> : null}
            {resolvedStatus.label}
          </span>
        ) : null}
      </span>

      <span className={styles.content}>
        <span className={styles.dateLine}>
          <strong>{date.time}</strong>
          <small>{date.day}</small>
        </span>
        <strong className={styles.title}>{title}</strong>
        <span className={styles.location}><MapPin size={14} aria-hidden="true" /> {location}</span>
        {renderedMetaItems.length ? (
          <span className={styles.metaRow}>
            {renderedMetaItems.map((item, index) => {
              const Icon = item.icon;
              return <span key={`${item.label}-${index}`}>{Icon ? <Icon size={14} aria-hidden="true" /> : null}{item.label}</span>;
            })}
          </span>
        ) : null}
        {showDescription && event.description ? <span className={styles.description}>{event.description}</span> : null}
        {displayProgress && capacity > 0 ? (
          <span className={styles.progressBlock}>
            <span><small>Partecipanti</small><b>{participants}/{capacity}</b></span>
            <progress value={participants} max={capacity} />
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <Card
      as="article"
      className={`${styles.card} ${styles[`variant_${safeVariant}`]} ${styles[`context_${context}`] || ''} ${selected ? styles.selected : ''} ${resolvedStatus?.tone === 'danger' ? styles.danger : ''} ${resolvedStatus?.tone === 'neutral' ? styles.mutedCard : ''} ${className}`.trim()}
    >
      {onSelect ? (
        <button type="button" className={styles.main} onClick={() => onSelect(event)} aria-label={`Seleziona ${title}`}>
          {mainContent}
        </button>
      ) : (
        <Link className={styles.main} to={detailHref} target={linkTarget} aria-label={`Apri ${title}`}>
          {mainContent}
        </Link>
      )}

      {onToggleSave ? (
        <button
          type="button"
          className={`${styles.saveButton} ${event.is_saved ? styles.saveButtonActive : ''}`}
          onClick={() => onToggleSave(event)}
          disabled={saving}
          aria-label={event.is_saved ? 'Rimuovi evento dai salvati' : 'Salva evento'}
          title={event.is_saved ? 'Salvato' : 'Salva'}
        >
          {event.is_saved ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
        </button>
      ) : null}

      {stats.length ? (
        <div className={styles.statsGrid}>
          {stats.map((item) => (
            <span key={item.label}><b>{item.value}</b><small>{item.label}</small></span>
          ))}
        </div>
      ) : null}

      {hasActions ? (
        <div className={styles.actions}>
          {secondaryAction ? (
            <button type="button" className={styles.secondaryAction} onClick={() => secondaryAction.onClick?.(event)}>
              {SecondaryIcon ? <SecondaryIcon size={16} aria-hidden="true" /> : null}{secondaryAction.label}
            </button>
          ) : null}
          {onBookGroup ? (
            <button type="button" className={styles.primaryAction} onClick={() => onBookGroup(event)} disabled={booking}>
              <Users size={16} aria-hidden="true" />{booking ? 'Prenotazione…' : 'Prenota'}
            </button>
          ) : null}
          {primaryAction ? (
            <button type="button" className={styles.primaryAction} onClick={() => primaryAction.onClick?.(event)} disabled={primaryAction.disabled}>
              {PrimaryIcon ? <PrimaryIcon size={16} aria-hidden="true" /> : null}{primaryAction.label}
            </button>
          ) : null}
          {detailsLabel ? (
            <Link
              className={`${styles.detailsAction} ${detailsIconOnly ? styles.iconOnly : ''}`}
              to={detailHref}
              target={linkTarget}
              aria-label={detailsIconOnly ? `Dettagli ${title}` : undefined}
              title={detailsIconOnly ? 'Dettagli' : undefined}
            >
              {detailsIconOnly ? <ChevronRight size={18} aria-hidden="true" /> : <>{detailsLabel}<ChevronRight size={16} aria-hidden="true" /></>}
            </Link>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default EventCard;
