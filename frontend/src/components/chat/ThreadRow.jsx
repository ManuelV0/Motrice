import { Archive, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from '../../styles/components/chat/threadRow.module.css';

const DELETE_REVEAL_PX = 96;
const SWIPE_THRESHOLD_PX = 44;

function initialsFromTitle(title = '') {
  const clean = String(title || '').trim();
  if (!clean) return 'CH';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatThreadTime(iso) {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function resolveSportAsset(thread) {
  const explicit = String(thread?.avatarUrl || '').trim();
  if (explicit) return explicit;
  const value = `${thread?.meta?.sportSlug || ''} ${thread?.meta?.sportName || ''} ${thread?.title || ''}`.toLowerCase();
  const matches = [
    { terms: ['calcetto', 'calcio', 'football'], asset: 'calcio' },
    { terms: ['palestra', 'gym', 'fitness', 'forza'], asset: 'palestra' },
    { terms: ['running', 'corsa', 'jogging'], asset: 'running' },
    { terms: ['trekking', 'escursione', 'hiking'], asset: 'trekking' },
    { terms: ['padel', 'tennis'], asset: 'padel' },
    { terms: ['bici', 'bike', 'ciclismo', 'mtb'], asset: 'bici' }
  ];
  const match = matches.find((item) => item.terms.some((term) => value.includes(term)));
  return match ? `/images/${match.asset}.svg` : '';
}

function ThreadRow({ thread, archived = false, onOpen, onDeleteRequest }) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gestureRef = useRef(null);
  const didDragRef = useRef(false);
  const eventStatus = String(thread?.meta?.eventStatus || '').trim().toLowerCase();
  const fallbackPreview = archived
    ? eventStatus === 'cancelled'
      ? 'Evento annullato · Chat archiviata'
      : 'Evento concluso · Chat in sola lettura'
    : 'Chat pronta · Scrivi il primo messaggio';
  const preview = String(thread?.lastMessage || '').trim() || fallbackPreview;
  const title = String(thread?.title || 'Chat').trim() || 'Chat';
  const sportAsset = resolveSportAsset(thread);
  const formattedTime = formatThreadTime(thread?.lastTs);
  const unreadCount = Number(thread?.unreadCount || 0);
  const senderPrefix = String(thread?.lastMessageSenderName || '').trim();
  const previewText = senderPrefix && thread?.lastMessage ? `${senderPrefix}: ${preview}` : preview;
  const deleteEnabled = typeof onDeleteRequest === 'function';

  useEffect(() => {
    setSwipeOffset(0);
    gestureRef.current = null;
    didDragRef.current = false;
  }, [thread?.id]);

  function handlePointerDown(event) {
    if (!deleteEnabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: swipeOffset,
      horizontal: false,
      cancelled: false
    };
    didDragRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.horizontal) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        gesture.cancelled = true;
        setDragging(false);
        return;
      }
      gesture.horizontal = true;
    }

    didDragRef.current = true;
    const nextOffset = Math.max(0, Math.min(DELETE_REVEAL_PX, gesture.startOffset + deltaX));
    setSwipeOffset(nextOffset);
  }

  function settleSwipe(event) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setDragging(false);
    setSwipeOffset((current) => (current >= SWIPE_THRESHOLD_PX ? DELETE_REVEAL_PX : 0));
  }

  function handleRowClick(event) {
    if (didDragRef.current) {
      event.preventDefault();
      didDragRef.current = false;
      return;
    }
    if (swipeOffset > 0) {
      setSwipeOffset(0);
      return;
    }
    onOpen?.();
  }

  function handleKeyDown(event) {
    if (!deleteEnabled) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSwipeOffset(DELETE_REVEAL_PX);
    }
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault();
      setSwipeOffset(0);
    }
  }

  return (
    <div className={`${styles.swipeShell} ${swipeOffset > 0 ? styles.swipeOpen : ''}`}>
      {deleteEnabled ? (
        <button
          type="button"
          className={styles.deleteAction}
          tabIndex={swipeOffset > 0 ? 0 : -1}
          aria-hidden={swipeOffset === 0}
          aria-label={`Elimina chat ${title}`}
          onClick={() => {
            setSwipeOffset(0);
            onDeleteRequest(thread);
          }}
        >
          <Trash2 size={21} aria-hidden="true" />
          <span>Elimina</span>
        </button>
      ) : null}

      <button
        type="button"
        className={`${styles.row} ${dragging ? styles.rowDragging : ''} ${unreadCount > 0 ? styles.rowUnread : ''} ${archived ? styles.rowArchived : ''}`}
        style={{ transform: `translate3d(${swipeOffset}px, 0, 0)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={settleSwipe}
        onPointerCancel={settleSwipe}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        aria-expanded={deleteEnabled ? swipeOffset > 0 : undefined}
        aria-label={`Apri chat ${title}. Scorri verso destra per eliminarla`}
      >
        <span className={styles.avatar} aria-hidden="true">
          {sportAsset ? (
            <img
              src={sportAsset}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
          <span>{initialsFromTitle(title)}</span>
        </span>

        <span className={styles.copy}>
          <span className={styles.top}>
            <strong className={styles.title}>{title}</strong>
            <small className={`${styles.time} ${unreadCount > 0 ? styles.timeUnread : ''}`}>{formattedTime}</small>
          </span>
          <span className={styles.bottom}>
            <span className={styles.preview}>{previewText}</span>
            {unreadCount > 0 ? (
              <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : archived ? (
              <span className={styles.archiveFlag} aria-label="Chat archiviata"><Archive size={14} aria-hidden="true" /></span>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  );
}

export default ThreadRow;
