import { CircleDollarSign, FileText, LayoutDashboard, Settings, Ticket } from 'lucide-react';
import styles from './PartnerPortalLayout.module.css';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'voucher', label: 'Voucher', icon: Ticket },
  { key: 'convenzione', label: 'Convenzione', icon: FileText },
  { key: 'pagamenti', label: 'Pagamenti', icon: CircleDollarSign },
  { key: 'impostazioni', label: 'Impostazioni', icon: Settings }
];

export default function PartnerPortalLayout({
  partnerName,
  activationStatus,
  onNavigate,
  activeRoute,
  topActions,
  children
}) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <p className={styles.title}>Motrice Partner Portal</p>
          <p className={styles.subtitle}>{partnerName || 'Partner'} · Area gestionale convenzioni</p>
        </div>
        <div className={styles.quickActions}>
          <span className={`${styles.statusPill} ${styles[`status${String(activationStatus || 'inactive').toLowerCase()}`]}`}>
            {activationStatus === 'active' ? 'Attivo' : activationStatus === 'pending' ? 'Pending' : activationStatus === 'expired' ? 'Expired' : 'Non attivo'}
          </span>
          {topActions}
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Navigazione partner portal">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={styles.navButton}
              data-active={activeRoute === item.key}
              onClick={() => onNavigate(item.key)}
              aria-label={`Apri ${item.label}`}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className={styles.main}>{children}</section>
      </div>

      <nav className={styles.bottomNav} aria-label="Navigazione rapida partner portal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={styles.bottomNavButton}
              data-active={activeRoute === item.key}
              onClick={() => onNavigate(item.key)}
              aria-label={item.label}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
