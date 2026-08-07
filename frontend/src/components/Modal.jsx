import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Card from './Card';
import Button from './Button';
import styles from '../styles/components/modal.module.css';

function Modal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmText = 'Conferma',
  confirmDisabled = false,
  closeText = 'Annulla',
  showConfirm = true
}) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousActive = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const getFocusable = () =>
      Array.from(
        modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])'
        ) || []
      );
    const controls = Array.from(modalRef.current?.querySelectorAll('input, select, textarea') || []);
    const focusable = getFocusable();
    const focusTarget = controls[0] || focusable[0];
    if (focusTarget) focusTarget.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.();

      if (event.key === 'Tab') {
        const nodes = getFocusable();
        if (!nodes.length) return;

        const first = nodes[0];
        const last = nodes[nodes.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <Card className={styles.panel} ref={modalRef}>
        <h3>{title}</h3>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {closeText}
          </Button>
          {showConfirm ? (
            <Button type="button" onClick={onConfirm} disabled={confirmDisabled}>
              {confirmText}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>,
    document.body
  );
}

export default Modal;
