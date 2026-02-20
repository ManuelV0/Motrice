import { Bell, BookOpenCheck, PiggyBank, Settings } from 'lucide-react';
import styles from '../../styles/components/accountQuickActions.module.css';

function AccountQuickActions({ onWallet, onNotifications, onTutorial, onSettings }) {
  return (
    <section className={styles.wrap} aria-label="Azioni rapide account">
      <button type="button" className={styles.action} onClick={onWallet} aria-label="Apri sezione wallet">
        <PiggyBank size={16} aria-hidden="true" />
        <span>Wallet</span>
      </button>
      <button type="button" className={styles.action} onClick={onNotifications} aria-label="Apri notifiche">
        <Bell size={16} aria-hidden="true" />
        <span>Notifiche</span>
      </button>
      <button type="button" className={styles.action} onClick={onTutorial} aria-label="Apri sezione tutorial">
        <BookOpenCheck size={16} aria-hidden="true" />
        <span>Tutorial</span>
      </button>
      <button type="button" className={styles.action} onClick={onSettings} aria-label="Apri impostazioni">
        <Settings size={16} aria-hidden="true" />
        <span>Impostazioni</span>
      </button>
    </section>
  );
}

export default AccountQuickActions;
