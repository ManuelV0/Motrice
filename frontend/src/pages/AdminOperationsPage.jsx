import {
  Activity,
  ArrowRight,
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  FileClock,
  Handshake,
  Info,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { getAdminOperationsSnapshot } from '../services/adminOperations';
import { getAuthSession } from '../services/authSession';
import {
  buildAdminAlerts,
  filterAdminEvents,
  filterAdminUsers
} from '../utils/adminOperationsView';
import styles from '../styles/pages/adminOperations.module.css';

const TABS = [
  { id: 'overview', label: 'Panoramica', icon: Activity },
  { id: 'users', label: 'Utenti', icon: UsersRound },
  { id: 'events', label: 'Eventi', icon: CalendarClock },
  { id: 'wallet', label: 'Wallet', icon: WalletCards },
  { id: 'verifications', label: 'Verifiche', icon: ShieldCheck }
];

const EVENT_FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'active', label: 'In corso' },
  { id: 'attention', label: 'Da controllare' },
  { id: 'completed', label: 'Conclusi' },
  { id: 'cancelled', label: 'Annullati' }
];

const USER_FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'verified', label: 'Verificati' },
  { id: 'pending', label: 'In attesa' },
  { id: 'attention', label: 'Da controllare' }
];

const STATUS_LABELS = {
  active: 'In corso',
  attention: 'Da controllare',
  published: 'Programmato',
  confirmed: 'Confermato',
  checkin_open: 'Check-in aperto',
  completed: 'Concluso',
  archived: 'Archiviato',
  cancelled: 'Annullato',
  pending: 'In attesa',
  verified: 'Verificato',
  suspended: 'Sospeso',
  rejected: 'Rifiutato',
  unverified: 'Non verificato',
  restricted: 'Limitato',
  closed: 'Chiuso'
};

function formatNumber(value) {
  return new Intl.NumberFormat('it-IT').format(Number(value || 0));
}

function formatMoney(value) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0) / 100);
}

function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date);
}

function initials(value) {
  return String(value || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function StatusPill({ value }) {
  const status = String(value || 'unverified').toLowerCase();
  return (
    <span className={`${styles.status} ${styles[`status_${status}`] || ''}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function adminRoleLabel(session) {
  if (String(session?.email || '').trim().toLowerCase() === 'aletarqui@libero.it') return 'Proprietario';
  if (String(session?.role || '').toLowerCase() === 'moderator') return 'Moderatore';
  return 'Amministratore';
}

function MetricCard({ icon: Icon, label, value, note, attention = false, onClick }) {
  const content = (
    <>
      <span className={styles.metricIcon}><Icon size={19} /></span>
      <span className={styles.metricCopy}>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
      </span>
      {onClick ? <ChevronRight size={16} className={styles.metricChevron} /> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`${styles.metricCard} ${styles.metricButton} ${attention ? styles.metricAttention : ''}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <article className={`${styles.metricCard} ${attention ? styles.metricAttention : ''}`}>
      {content}
    </article>
  );
}

function DetailDrawer({ open, title, subtitle, onClose, children, footer }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={styles.drawerOverlay} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className={styles.detailDrawer} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.drawerHeader}>
          <span><small>{subtitle}</small><h2>{title}</h2></span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Chiudi dettaglio"><X size={20} /></button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
        {footer ? <footer className={styles.drawerFooter}>{footer}</footer> : null}
      </aside>
    </div>,
    document.body
  );
}

function DetailField({ label, value }) {
  return <span className={styles.detailField}><small>{label}</small><strong>{value || '—'}</strong></span>;
}

function ModuleLink({ to, icon: Icon, title, description, count }) {
  return (
    <Link to={to} className={styles.moduleLink}>
      <span className={styles.moduleIcon}><Icon size={20} /></span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {count != null ? <b>{formatNumber(count)}</b> : <ArrowRight size={18} />}
    </Link>
  );
}

function OverviewPanel({ data, onNavigate }) {
  const totalFunds = data.wallet.available_cents + data.wallet.locked_cents + data.wallet.pending_cents + data.wallet.withdrawable_cents;
  const alerts = buildAdminAlerts(data);
  return (
    <div className={styles.panelStack}>
      {alerts.length > 0 ? (
        <section className={styles.alertStack} aria-label="Priorità operative">
          {alerts.map((alert) => {
            const AlertIcon = alert.severity === 'critical' ? CircleAlert : alert.severity === 'attention' ? Clock3 : Info;
            return (
              <button key={alert.id} type="button" className={`${styles.alertCard} ${styles[`alert_${alert.severity}`]}`} onClick={() => onNavigate(alert.tab, alert.filter)}>
                <AlertIcon size={20} />
                <span>
                  <small>{alert.severity === 'critical' ? 'Critica' : alert.severity === 'attention' ? 'Attenzione' : 'Informazione'}</small>
                  <strong>{alert.title}</strong>
                  <span>{alert.description}</span>
                </span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </section>
      ) : (
        <div className={styles.successBanner}>
          <CheckCircle2 size={20} />
          <span>
            <strong>Nessuna anomalia temporale rilevata</strong>
            <small>Gli eventi terminati risultano allineati al ciclo operativo.</small>
          </span>
        </div>
      )}

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div><small>Oggi</small><h2>Situazione operativa</h2></div>
          <span>{formatDate(data.generated_at)}</span>
        </div>
        <div className={styles.metricsGrid}>
          <MetricCard icon={UsersRound} label="Utenti" value={formatNumber(data.metrics.users_total)} note={`${formatNumber(data.metrics.users_verified)} verificati`} onClick={() => onNavigate('users', 'all')} />
          <MetricCard icon={CalendarClock} label="Eventi oggi" value={formatNumber(data.metrics.events_today)} note={`${formatNumber(data.metrics.events_active)} in corso`} onClick={() => onNavigate('events', 'today')} />
          <MetricCard icon={Clock3} label="Verifiche" value={formatNumber(data.verification.pending)} note="in attesa" attention={data.verification.pending > 0} onClick={() => onNavigate('verifications', 'pending')} />
          <MetricCard icon={BadgeEuro} label="Valore gestito" value={formatMoney(totalFunds)} note={`${formatMoney(data.wallet.locked_cents)} vincolati`} onClick={() => onNavigate('wallet', 'all')} />
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div><small>Accessi rapidi</small><h2>Moduli amministrativi</h2></div>
        </div>
        <div className={styles.modulesGrid}>
          <ModuleLink to="/admin/verifiche" icon={ShieldCheck} title="Centro verifiche" description="Identità e foto profilo" count={data.verification.pending} />
          <ModuleLink to="/admin/coach-applications" icon={UsersRound} title="Candidature coach" description="Revisione e certificazioni" />
          <ModuleLink to="/admin/convenzioni-applications" icon={Handshake} title="Convenzioni" description="Partner, contratti e richieste" />
          <ModuleLink to="/admin/tutorial" icon={Activity} title="Tutorial" description="Contenuti guida dell’app" />
        </div>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div><small>Tracciabilità</small><h2>Ultime attività amministrative</h2></div>
          <span>{data.audit.length} registrate</span>
        </div>
        {data.audit.length > 0 ? (
          <div className={styles.auditList}>
            {data.audit.slice(0, 5).map((entry) => (
              <article key={entry.id}>
                <span className={styles.auditDot} />
                <span>
                  <strong>{entry.action}</strong>
                  <small>{entry.actor_name || 'Amministratore'} · {entry.target_type} · {formatDate(entry.created_at)}</small>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.auditEmpty}><ShieldCheck size={16} /> Nessuna azione amministrativa registrata. Il registro audit è pronto per la fase operativa.</p>
        )}
      </section>
    </div>
  );
}

function UsersPanel({ users, initialStatus = 'all', onSelect }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [visibleCount, setVisibleCount] = useState(20);
  const filtered = useMemo(
    () => filterAdminUsers(users, { query, status }),
    [query, status, users]
  );

  useEffect(() => {
    setVisibleCount(20);
  }, [query, status]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeading}>
        <div><small>Account</small><h2>Utenti e accessi</h2></div>
        <span>{filtered.length} risultati</span>
      </div>
      <label className={styles.searchBox}>
        <Search size={17} />
        <input aria-label="Cerca nome, email o città" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca nome, email o città" />
      </label>
      <div className={styles.filters} role="tablist" aria-label="Filtra utenti amministrativi">
        {USER_FILTERS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={status === item.id} onClick={() => setStatus(item.id)}>{item.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={UsersRound} title="Nessun utente trovato" description="Modifica i termini della ricerca." />
      ) : (
        <div className={styles.dataList}>
          {filtered.slice(0, visibleCount).map((user) => (
            <button type="button" key={user.id} className={styles.userRow} onClick={() => onSelect(user)} aria-label={`Apri dettaglio di ${user.display_name || 'utente'}`}>
              <span className={styles.avatar}>
                {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user.display_name)}
              </span>
              <span className={styles.primaryCopy}>
                <strong>{user.display_name || 'Utente Motrice'}</strong>
                <small>{user.email || user.city || 'Profilo Motrice'}</small>
              </span>
              <span className={styles.userStats}>
                <span><b>{formatNumber(user.events_created)}</b><small>eventi</small></span>
                <span><b>{formatNumber(user.reliability_score)}%</b><small>affidabilità</small></span>
                <span><b>{formatMoney(user.balance_cents)}</b><small>disponibili</small></span>
              </span>
              <div className={styles.rowStatuses}>
                <StatusPill value={user.verification_status} />
                {user.account_status && user.account_status !== 'active' ? <StatusPill value={user.account_status} /> : null}
                <ChevronRight size={16} className={styles.rowChevron} />
              </div>
            </button>
          ))}
        </div>
      )}
      {filtered.length > visibleCount ? (
        <button type="button" className={styles.loadMore} onClick={() => setVisibleCount((value) => value + 20)}>
          Mostra altri utenti
        </button>
      ) : null}
      <p className={styles.readOnlyNote}><ShieldCheck size={15} /> Vista protetta in sola lettura. Le azioni sugli account saranno introdotte con motivazione e registro di audit.</p>
    </section>
  );
}

function EventsPanel({ events, initialStatus = 'all', initialDate = 'all', onSelect }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(initialStatus);
  const [dateFilter, setDateFilter] = useState(initialDate);
  const [sportFilter, setSportFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(20);
  const sportOptions = useMemo(
    () => [...new Set(events.map((event) => event.sport_name).filter(Boolean))].sort(),
    [events]
  );
  const cityOptions = useMemo(
    () => [...new Set(events.map((event) => event.city).filter(Boolean))].sort(),
    [events]
  );
  const filtered = useMemo(
    () => filterAdminEvents(events, {
      query,
      status: filter,
      date: dateFilter,
      sport: sportFilter,
      city: cityFilter
    }),
    [cityFilter, dateFilter, events, filter, query, sportFilter]
  );

  useEffect(() => {
    setVisibleCount(20);
  }, [cityFilter, dateFilter, filter, query, sportFilter]);

  useEffect(() => {
    setFilter(initialStatus);
    setDateFilter(initialDate);
  }, [initialDate, initialStatus]);

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeading}>
        <div><small>Ciclo evento</small><h2>Eventi e presenze</h2></div>
        <span>{filtered.length} eventi</span>
      </div>
      <label className={styles.searchBox}>
        <Search size={17} />
        <input aria-label="Cerca evento, luogo o organizzatore" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca evento, luogo o organizzatore" />
      </label>
      <div className={styles.filters} role="tablist" aria-label="Filtra eventi amministrativi">
        {EVENT_FILTERS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className={styles.selectFilters}>
        <label>
          <span>Data</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">Qualsiasi data</option>
            <option value="today">Oggi</option>
            <option value="week">Prossimi 7 giorni</option>
            <option value="upcoming">Futuri</option>
            <option value="past">Passati</option>
          </select>
        </label>
        <label>
          <span>Sport</span>
          <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
            <option value="all">Tutti gli sport</option>
            {sportOptions.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
          </select>
        </label>
        <label>
          <span>Città</span>
          <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            <option value="all">Tutte le città</option>
            {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nessun evento in questo stato" description="Prova un altro filtro operativo." />
      ) : (
        <div className={styles.dataList}>
          {filtered.slice(0, visibleCount).map((event) => (
            <button type="button" key={event.id} className={styles.eventRow} onClick={() => onSelect(event)} aria-label={`Apri dettaglio evento ${event.title}`}>
              <span className={styles.dateTile}>
                <b>{formatDate(event.starts_at, false).split(' ')[0]}</b>
                <small>{formatDate(event.starts_at, false).split(' ')[1] || ''}</small>
              </span>
              <span className={styles.primaryCopy}>
                <strong>{event.title}</strong>
                <small>{event.sport_name}{event.location_name ? ` · ${event.location_name}` : ''}</small>
                <span>{formatDate(event.starts_at)} · {formatNumber(event.duration_minutes)} min</span>
              </span>
              <span className={styles.eventStats}>
                <span><b>{formatNumber(event.participants_count)}/{formatNumber(event.max_participants)}</b><small>iscritti</small></span>
                <span><b>{formatNumber(event.checked_in_count)}</b><small>check-in</small></span>
                <span><b>{formatNumber(event.no_show_count)}</b><small>no-show</small></span>
              </span>
              <StatusPill value={event.lifecycle_state} />
            </button>
          ))}
        </div>
      )}
      {filtered.length > visibleCount ? (
        <button type="button" className={styles.loadMore} onClick={() => setVisibleCount((value) => value + 20)}>
          Mostra altri eventi
        </button>
      ) : null}
    </section>
  );
}

function UserDetailDrawer({ user, events, onClose }) {
  const createdEvents = useMemo(() => {
    if (!user) return [];
    const userId = String(user.id || '');
    const userName = String(user.display_name || '').trim().toLowerCase();
    return events.filter((event) => (
      String(event.creator_id || '') === userId ||
      String(event.creator_name || '').trim().toLowerCase() === userName
    )).slice(0, 4);
  }, [events, user]);

  return (
    <DetailDrawer
      open={Boolean(user)}
      title={user?.display_name || 'Dettaglio utente'}
      subtitle="Scheda utente"
      onClose={onClose}
      footer={user?.id ? <Link to={`/profile/${user.id}`}>Apri profilo pubblico <ArrowRight size={17} /></Link> : null}
    >
      {user ? (
        <>
          <div className={styles.drawerIdentity}>
            <span className={styles.drawerAvatar}>
              {user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials(user.display_name)}
            </span>
            <span>
              <strong>{user.display_name}</strong>
              <small>{user.email || user.city || 'Account Motrice'}</small>
            </span>
            <StatusPill value={user.verification_status} />
          </div>
          <div className={styles.detailGrid}>
            <DetailField label="Affidabilità" value={`${formatNumber(user.reliability_score)}%`} />
            <DetailField label="Eventi creati" value={formatNumber(user.events_created)} />
            <DetailField label="Saldo disponibile" value={formatMoney(user.balance_cents)} />
            <DetailField label="Stato account" value={user.account_status === 'active' ? 'Attivo' : (STATUS_LABELS[user.account_status] || user.account_status)} />
            <DetailField label="Città" value={user.city} />
            <DetailField label="ID account" value={String(user.id || '')} />
          </div>
          <section className={styles.drawerSection}>
            <div><small>Attività</small><h3>Ultimi eventi creati</h3></div>
            {createdEvents.length > 0 ? createdEvents.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className={styles.drawerEventLink}>
                <span><strong>{event.title}</strong><small>{formatDate(event.starts_at)} · {event.location_name}</small></span>
                <ChevronRight size={16} />
              </Link>
            )) : <p>Nessun evento disponibile nel riepilogo corrente.</p>}
          </section>
          <p className={styles.drawerNotice}><ShieldCheck size={15} /> Le statistiche sono generate dal sistema e non sono modificabili dal profilo.</p>
        </>
      ) : null}
    </DetailDrawer>
  );
}

function EventDetailDrawer({ event, onClose }) {
  return (
    <DetailDrawer
      open={Boolean(event)}
      title={event?.title || 'Dettaglio evento'}
      subtitle="Controllo evento"
      onClose={onClose}
      footer={event?.id ? <Link to={`/events/${event.id}`}>Apri dettagli completi <ArrowRight size={17} /></Link> : null}
    >
      {event ? (
        <>
          <div className={styles.drawerEventHero}>
            <span className={styles.dateTile}>
              <b>{formatDate(event.starts_at, false).split(' ')[0]}</b>
              <small>{formatDate(event.starts_at, false).split(' ')[1] || ''}</small>
            </span>
            <span>
              <strong>{event.sport_name || 'Attività Motrice'}</strong>
              <small><MapPin size={13} /> {event.location_name || event.city || 'Luogo non indicato'}</small>
            </span>
            <StatusPill value={event.lifecycle_state} />
          </div>
          <div className={styles.detailGrid}>
            <DetailField label="Data e ora" value={formatDate(event.starts_at)} />
            <DetailField label="Durata" value={`${formatNumber(event.duration_minutes)} min`} />
            <DetailField label="Organizzatore" value={event.creator_name} />
            <DetailField label="Partecipanti" value={`${formatNumber(event.participants_count)}/${formatNumber(event.max_participants)}`} />
            <DetailField label="Check-in" value={formatNumber(event.checked_in_count)} />
            <DetailField label="No-show" value={formatNumber(event.no_show_count)} />
          </div>
          <section className={styles.drawerSection}>
            <div><small>Ciclo operativo</small><h3>Stato della sessione</h3></div>
            <div className={styles.lifecycleLine}>
              <span className={styles.lifecycleDone}>Pubblicato</span>
              <span className={event.lifecycle_state === 'published' ? styles.lifecycleCurrent : styles.lifecycleDone}>Check-in</span>
              <span className={['active', 'completed'].includes(event.lifecycle_state) ? styles.lifecycleDone : ''}>Allenamento</span>
              <span className={event.lifecycle_state === 'completed' ? styles.lifecycleDone : ''}>Chiusura</span>
            </div>
          </section>
          {event.lifecycle_state === 'attention' ? (
            <p className={`${styles.drawerNotice} ${styles.drawerNoticeAttention}`}><CircleAlert size={15} /> Questo evento è terminato ma richiede una verifica del ciclo operativo.</p>
          ) : (
            <p className={styles.drawerNotice}><CheckCircle2 size={15} /> Nessuna anomalia immediata rilevata per questo evento.</p>
          )}
        </>
      ) : null}
    </DetailDrawer>
  );
}

function WalletPanel({ wallet, ledger }) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div><small>Contabilità operativa</small><h2>Wallet e somme vincolate</h2></div>
        </div>
        <div className={styles.moneyGrid}>
          <MetricCard icon={CircleDollarSign} label="Disponibile" value={formatMoney(wallet.available_cents)} note="saldo spendibile" />
          <MetricCard icon={ShieldCheck} label="Vincolato" value={formatMoney(wallet.locked_cents)} note={`${wallet.active_holds} caparre attive`} />
          <MetricCard icon={Clock3} label="In attesa" value={formatMoney(wallet.pending_cents)} note="entro chiusura evento" />
          <MetricCard icon={BadgeEuro} label="Prelevabile" value={formatMoney(wallet.withdrawable_cents)} note="maturato dagli utenti" />
        </div>
      </section>
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeading}>
          <div><small>Ultimi movimenti</small><h2>Ledger immutabile</h2></div>
          <span>{ledger.length} voci</span>
        </div>
        {ledger.length === 0 ? (
          <EmptyState icon={WalletCards} title="Nessun movimento" description="I movimenti monetari appariranno qui quando saranno registrati." />
        ) : (
          <div className={styles.ledgerList}>
            {ledger.map((entry, index) => {
              const hasCanonicalDelta = ['available_delta', 'locked_delta', 'pending_delta', 'withdrawable_delta']
                .some((key) => Object.prototype.hasOwnProperty.call(entry, key));
              const delta = hasCanonicalDelta
                ? Number(entry.available_delta || 0) + Number(entry.locked_delta || 0) + Number(entry.pending_delta || 0) + Number(entry.withdrawable_delta || 0)
                : Number(entry.amount_cents || 0);
              return (
                <article key={entry.id || `${entry.created_at}-${index}`}>
                  <span className={styles.ledgerIcon}><WalletCards size={17} /></span>
                  <span><strong>{entry.entry_type || 'Movimento wallet'}</strong><small>{entry.display_name || formatDate(entry.created_at)}</small></span>
                  <b className={delta >= 0 ? styles.positiveMoney : styles.negativeMoney}>{delta >= 0 ? '+' : ''}{formatMoney(delta)}</b>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function VerificationsPanel({ verification }) {
  return (
    <div className={styles.panelStack}>
      <section className={styles.verificationHero}>
        <span><ShieldCheck size={28} /></span>
        <div>
          <small>Sicurezza utenti</small>
          <h2>{verification.pending > 0 ? `${verification.pending} verifiche da esaminare` : 'Coda verifiche aggiornata'}</h2>
          <p>Le foto di identità restano private e sono visibili esclusivamente nel centro dedicato.</p>
        </div>
        <Link to="/admin/verifiche">Apri centro verifiche <ArrowRight size={17} /></Link>
      </section>
      <section className={styles.sectionCard}>
        <div className={styles.metricsGrid}>
          <MetricCard icon={Clock3} label="In attesa" value={formatNumber(verification.pending)} note="da revisionare" attention={verification.pending > 0} />
          <MetricCard icon={CheckCircle2} label="Verificati" value={formatNumber(verification.verified)} note="accesso completo" />
          <MetricCard icon={ShieldCheck} label="Sospesi" value={formatNumber(verification.suspended)} note="funzioni bloccate" />
          <MetricCard icon={FileClock} label="Rifiutati" value={formatNumber(verification.rejected)} note="richiesta archiviata" />
        </div>
      </section>
    </div>
  );
}

function AdminOperationsPage() {
  const { showToast } = useToast();
  const session = getAuthSession();
  const [activeTab, setActiveTab] = useState('overview');
  const [userPreset, setUserPreset] = useState('all');
  const [eventStatusPreset, setEventStatusPreset] = useState('all');
  const [eventDatePreset, setEventDatePreset] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  usePageMeta({
    title: 'Centro operativo | Motrice',
    description: 'Panoramica amministrativa protetta della beta Motrice.'
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await getAdminOperationsSnapshot());
      if (silent) showToast('Dati amministrativi aggiornati', 'success');
    } catch (error) {
      showToast(error.message || 'Impossibile caricare il centro operativo', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function navigateToSection(tab, filter = 'all') {
    if (tab === 'users') setUserPreset(filter || 'all');
    if (tab === 'events') {
      if (['today', 'week', 'upcoming', 'past'].includes(filter)) {
        setEventStatusPreset('all');
        setEventDatePreset(filter);
      } else {
        setEventStatusPreset(filter || 'all');
        setEventDatePreset('all');
      }
    }
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      document.querySelector(`.${styles.tabs}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <main className={styles.page} id="main-content">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p><ShieldCheck size={15} /> Amministrazione beta</p>
          <h1>Centro operativo</h1>
          <span>Controlla utenti, eventi, presenze e wallet da un unico punto.</span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.roleBadge}><UserCog size={14} /> {adminRoleLabel(session)}</span>
          {data ? <span className={data.source === 'admin_rpc' ? styles.liveBadge : styles.previewBadge}>{data.source === 'admin_rpc' ? 'Dati protetti' : 'Anteprima locale'}</span> : null}
          <button type="button" onClick={() => load({ silent: true })} disabled={refreshing || loading} aria-label="Aggiorna centro operativo">
            <RefreshCw size={19} className={refreshing ? styles.spin : ''} />
          </button>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Sezioni centro operativo">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => navigateToSection(tab.id, 'all')}
            >
              <Icon size={17} /><span>{tab.label}</span>
              {tab.id === 'verifications' && data?.verification.pending > 0 ? <b>{data.verification.pending}</b> : null}
            </button>
          );
        })}
      </nav>

      {loading ? <LoadingSkeleton rows={7} variant="detail" /> : !data ? (
        <EmptyState icon={ShieldCheck} title="Centro operativo non disponibile" description="Riprova ad aggiornare la pagina." primaryActionLabel="Riprova" onPrimaryAction={() => load()} />
      ) : (
        <div className={styles.content}>
          {activeTab === 'overview' ? <OverviewPanel data={data} onNavigate={navigateToSection} /> : null}
          {activeTab === 'users' ? <UsersPanel users={data.users} initialStatus={userPreset} onSelect={setSelectedUser} /> : null}
          {activeTab === 'events' ? <EventsPanel events={data.events} initialStatus={eventStatusPreset} initialDate={eventDatePreset} onSelect={setSelectedEvent} /> : null}
          {activeTab === 'wallet' ? <WalletPanel wallet={data.wallet} ledger={data.ledger} /> : null}
          {activeTab === 'verifications' ? <VerificationsPanel verification={data.verification} /> : null}
        </div>
      )}
      <UserDetailDrawer user={selectedUser} events={data?.events || []} onClose={() => setSelectedUser(null)} />
      <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </main>
  );
}

export default AdminOperationsPage;
