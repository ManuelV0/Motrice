import EventCard from '../EventCard';
import styles from '../../styles/components/exploreFeaturedRow.module.css';

function ExploreFeaturedRow({ events, onToggleSave, onBookGroup, savingIds, bookingGroupEventId }) {
  if (!events.length) return null;

  return (
    <section className={styles.section} aria-labelledby="featured-events-title">
      <div className={styles.head}>
        <h2 id="featured-events-title">In primo piano</h2>
        <p className={styles.hint}>Sessioni consigliate per popolarita e prossimita temporale.</p>
      </div>
      <div className={styles.row} role="list">
        {events.map((event) => (
          <div key={`featured-${event.id}`} className={styles.item} role="listitem">
            <EventCard
              event={event}
              variant="folder"
              onToggleSave={onToggleSave}
              onBookGroup={onBookGroup}
              saving={savingIds.includes(event.id)}
              booking={bookingGroupEventId === event.id}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default ExploreFeaturedRow;
