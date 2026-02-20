import styles from '../../styles/components/chat/chatTabs.module.css';

function ChatTabs({ value, onChange }) {
  return (
    <div className={styles.wrap} role="tablist" aria-label="Filtra chat">
      <span
        aria-hidden="true"
        className={`${styles.indicator} ${value === 'dm' ? styles.indicatorDm : ''}`}
      />
      <button
        type="button"
        className={`${styles.tab} ${value === 'event' ? styles.active : ''}`}
        role="tab"
        aria-selected={value === 'event'}
        onClick={() => onChange('event')}
      >
        Eventi
      </button>
      <button
        type="button"
        className={`${styles.tab} ${value === 'dm' ? styles.active : ''}`}
        role="tab"
        aria-selected={value === 'dm'}
        onClick={() => onChange('dm')}
      >
        DM
      </button>
    </div>
  );
}

export default ChatTabs;
