import { useMemo, useState } from 'react';
import Button from '../Button';
import styles from '../../styles/components/chat/friendRequestsPanel.module.css';

function FriendRequestsPanel({ requests, loading = false, onRespond, onOpenProfile, onOpenDm }) {
  const [tab, setTab] = useState('inbound');

  const inbound = Array.isArray(requests?.inbound) ? requests.inbound : [];
  const outbound = Array.isArray(requests?.outbound) ? requests.outbound : [];

  const visible = useMemo(() => (tab === 'inbound' ? inbound : outbound), [tab, inbound, outbound]);

  return (
    <section className={styles.panel} aria-label="Richieste amicizia">
      <div className={styles.head}>
        <h3>Richieste amicizia</h3>
        <div className={styles.tabs} role="tablist" aria-label="Filtra richieste">
          <button
            type="button"
            className={`${styles.tab} ${tab === 'inbound' ? styles.tabActive : ''}`}
            onClick={() => setTab('inbound')}
            role="tab"
            aria-selected={tab === 'inbound'}
          >
            In arrivo ({inbound.filter((item) => item.status === 'pending').length})
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'outbound' ? styles.tabActive : ''}`}
            onClick={() => setTab('outbound')}
            role="tab"
            aria-selected={tab === 'outbound'}
          >
            Inviate ({outbound.length})
          </button>
        </div>
      </div>

      {loading ? <p className="muted">Caricamento richieste...</p> : null}

      {!loading && visible.length === 0 ? (
        <p className="muted">Nessuna richiesta in questa sezione.</p>
      ) : (
        <div className={styles.list}>
          {visible.map((item) => {
            const isInbound = tab === 'inbound';
            const pending = String(item.status) === 'pending';
            const actorName = isInbound ? item.fromDisplayName : item.toDisplayName;
            const actorUserId = isInbound ? item.fromUserId : item.toUserId;
            const canOpenDm = !isInbound && String(item.status) === 'accepted';
            return (
              <article key={item.id} className={styles.row}>
                <button type="button" className={styles.profileBtn} onClick={() => onOpenProfile(actorUserId, item.eventId)}>
                  <strong>{actorName}</strong>
                  <small>Ti sei allenato con {actorName} a {item.eventPlace || 'luogo evento'}</small>
                </button>

                {isInbound ? (
                  pending ? (
                    <div className={styles.actions}>
                      <Button size="sm" onClick={() => onRespond(item.id, 'accepted')}>Accetta</Button>
                      <Button size="sm" variant="secondary" onClick={() => onRespond(item.id, 'rejected')}>Rifiuta</Button>
                    </div>
                  ) : (
                    <span className={styles.status}>{item.status === 'accepted' ? 'Accettata' : 'Rifiutata'}</span>
                  )
                ) : canOpenDm ? (
                  <Button size="sm" onClick={() => onOpenDm(actorUserId)}>Apri chat</Button>
                ) : (
                  <span className={styles.status}>
                    {item.status === 'pending' ? 'In attesa' : item.status === 'accepted' ? 'Accettata' : 'Rifiutata'}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default FriendRequestsPanel;
