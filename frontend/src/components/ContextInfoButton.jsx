import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import styles from '../styles/components/contextInfoButton.module.css';

function ContextInfoButton({ title, description, items = [], note = '', label, className = '' }) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  const accessibleLabel = label || `Informazioni: ${title}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className}`}
        aria-label={accessibleLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Info size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open ? createPortal(
        <div className={styles.overlay} onMouseDown={() => setOpen(false)}>
          <section
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="context-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className={styles.handle} aria-hidden="true" />
            <header className={styles.header}>
              <span className={styles.icon}><Info size={20} aria-hidden="true" /></span>
              <div>
                <small>COME FUNZIONA</small>
                <h2 id="context-info-title">{title}</h2>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Chiudi informazioni">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            {description ? <p className={styles.description}>{description}</p> : null}

            {items.length ? (
              <ul className={styles.list}>
                {items.map((item, index) => (
                  <li key={`${item.title || item}-${index}`}>
                    <span>{index + 1}</span>
                    <div>
                      {typeof item === 'string' ? <p>{item}</p> : (
                        <>
                          <strong>{item.title}</strong>
                          {item.text ? <p>{item.text}</p> : null}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {note ? <p className={styles.note}>{note}</p> : null}
            <button type="button" className={styles.doneButton} onClick={() => setOpen(false)}>Ho capito</button>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}

export default ContextInfoButton;
