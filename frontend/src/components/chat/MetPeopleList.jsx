import Button from '../Button';
import styles from '../../styles/components/chat/metPeopleList.module.css';

function MetPeopleList({ items, sendingById, onSendRequest, onOpenProfile }) {
  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    return <p className="muted">Nessuno da aggiungere ancora.</p>;
  }

  return (
    <div className={styles.list}>
      {list.map((item) => {
        const status = String(item.friendship_status || 'none');
        const busy = Boolean(sendingById[String(item.otherUserId)]);
        const disabled = busy || status === 'friends' || status === 'requested';

        return (
          <article key={`${item.eventId}_${item.otherUserId}`} className={styles.row}>
            <button type="button" className={styles.identity} onClick={() => onOpenProfile(item.otherUserId, item.eventId)}>
              <strong>{item.display_name}</strong>
              <small>Incontrato a: {item.eventPlace || 'Luogo evento'}</small>
            </button>

            <Button
              type="button"
              size="sm"
              variant={status === 'friends' ? 'secondary' : 'primary'}
              disabled={disabled}
              onClick={() => onSendRequest(item.otherUserId, item.eventId)}
            >
              {busy
                ? 'Invio...'
                : status === 'friends'
                  ? 'Amico'
                  : status === 'requested'
                    ? 'Richiesta inviata'
                    : status === 'rejected'
                      ? 'Rifiutata'
                      : 'Invia richiesta'}
            </Button>
          </article>
        );
      })}
    </div>
  );
}

export default MetPeopleList;
