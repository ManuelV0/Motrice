import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Users } from 'lucide-react';
import EventBadge from './EventBadge';
import Card from './Card';
import Button from './Button';
import styles from '../styles/components/eventCard.module.css';
import { getSportImage } from '../utils/sportImages';

function EventCard({
  event,
  variant = 'compact',
  onToggleSave,
  onBookGroup,
  saving = false,
  booking = false,
  className = ''
}) {
  const isExpanded = variant === 'expanded';
  const isFolder = variant === 'folder';

  return (
    <Card as="article" className={`${styles.card} ${isFolder ? styles.folder : ''} ${className}`.trim()} hover>
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={getSportImage(event.sport_name)}
          alt={`${event.sport_name} a ${event.location_name}`}
          loading="lazy"
          decoding="async"
          onError={(eventTarget) => {
            eventTarget.currentTarget.src = '/images/default-sport.svg';
          }}
        />
        <div className={styles.overlay}>
          <span className={styles.overlayText}>{event.sport_name}</span>
        </div>
      </div>

      <div className={styles.head}>
        <EventBadge label={event.sport_name} type="sport" />
        <EventBadge label={event.level} type="level" />
        {event.creator_plan === 'premium' && <EventBadge label="Premium" type="premium" />}
        {event.featured_boost && <EventBadge label="Featured" type="status" />}
        {Number(event.group_chat_unread_count || 0) > 0 && (
          <span className={styles.groupUnreadBadge}>
            Chat gruppo: {event.group_chat_unread_count} new
          </span>
        )}
      </div>

      <h3>
        <Link className={styles.titleLink} to={`/events/${event.id}`}>
          {event.location_name}
        </Link>
      </h3>

      {event.title && (
        <p>
          <strong>{event.title}</strong>
        </p>
      )}
      <p className="muted">{new Date(event.event_datetime).toLocaleString('it-IT')}</p>
      {event.city && <p className="muted">{event.city}</p>}
      <div>
        <p className={styles.progressLabel}>
          {event.participants_count}/{event.max_participants} partecipanti
        </p>
        <progress className={styles.progress} value={event.participants_count} max={event.max_participants} />
      </div>
      {event.is_going && (
        <p>
          <EventBadge label="You're going" type="status" />
        </p>
      )}

      {event.distance_km != null && <p className="muted">Distanza: {event.distance_km} km</p>}
      {event.route_info ? (
        <p className={styles.routeInfo}>
          Percorso: {event.route_info.name} - {event.route_info.from_label || 'Via X'} → {event.route_info.to_label || 'Via Y'} ({event.route_info.distance_km} km
          {event.route_info.elevation_gain_m ? `, +${event.route_info.elevation_gain_m} m` : ''})
        </p>
      ) : null}
      {isExpanded && <p>{event.description}</p>}
      <div className={styles.actions}>
        {onBookGroup && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onBookGroup(event)}
            disabled={booking}
            icon={Users}
            size={isFolder ? 'sm' : 'md'}
          >
            {booking ? 'Prenotazione...' : isFolder ? 'Prenota gruppo' : 'Prenota sessione di gruppo'}
          </Button>
        )}
        {onToggleSave && (
          <Button
            type="button"
            variant={event.is_saved ? 'secondary' : 'ghost'}
            onClick={() => onToggleSave(event)}
            disabled={saving}
            icon={event.is_saved ? BookmarkCheck : Bookmark}
            size={isFolder ? 'sm' : 'md'}
          >
            {event.is_saved ? (isFolder ? 'Salvato' : 'Salvato in agenda') : isFolder ? 'Salva' : 'Salva in agenda'}
          </Button>
        )}
        <Link to={`/events/${event.id}`}>
          <Button variant="ghost" size={isFolder ? 'sm' : 'md'}>{isFolder ? 'Apri' : 'View'}</Button>
        </Link>
      </div>
    </Card>
  );
}

export default EventCard;
