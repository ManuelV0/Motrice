import { useState } from 'react';
import Modal from './Modal';
import { useBilling } from '../context/BillingContext';
import { useToast } from '../context/ToastContext';
import { Lock, PlayCircle, Sparkles } from 'lucide-react';
import Button from './Button';
import {
  REWARDED_COOLDOWN_MINUTES,
  REWARDED_DAILY_LIMIT,
  REWARDED_DAILY_UNLOCK_LIMIT,
  REWARDED_UNLOCK_MINUTES,
  REWARDED_VIDEOS_REQUIRED
} from '../services/entitlements';
import RewardedVideoDemoModal from './RewardedVideoDemoModal';

function PaywallModal({ open, onClose, feature }) {
  const { activatePremium, activateFreeWithAds, activateRewardedUnlock, rewardedStatus, isPremium } = useBilling();
  const { showToast } = useToast();
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const useDemoVideoFlow = String(import.meta.env.VITE_REWARDED_REQUIRE_VIDEO || 'true').toLowerCase() !== 'false';

  function onActivate() {
    activatePremium();
    showToast('Premium attivato (dev)', 'success');
    onClose();
  }

  function onSwitchToFreeAds() {
    activateFreeWithAds();
    showToast('Piano Free con pubblicita attivato.', 'success');
  }

  function onRewardedUnlock() {
    if (useDemoVideoFlow) {
      setVideoModalOpen(true);
      return;
    }
    redeemRewardedUnlock();
  }

  function redeemRewardedUnlock() {
    try {
      const next = activateRewardedUnlock();
      const result = next?.rewarded_result;
      if (result?.unlocked_now) {
        showToast(`Contenuti Pro sbloccati per ${REWARDED_UNLOCK_MINUTES} minuti.`, 'success');
        onClose();
      } else if (result) {
        showToast(`Video completato: ${result.progress_videos}/${result.videos_required}.`, 'success');
      } else {
        showToast('Video completato.', 'success');
      }
    } catch (error) {
      showToast(error.message || 'Video non disponibile.', 'error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sblocca Premium"
      confirmText="Attiva Premium (dev)"
      onConfirm={onActivate}
    >
      <p className="row">
        <Lock size={16} aria-hidden="true" />
        <strong>{feature}</strong> e disponibile nel piano Premium.
      </p>
      <ul>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Eventi illimitati</li>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Filtri avanzati</li>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Agenda Settimana/Mese</li>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Add to Calendar (ICS)</li>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Upgrade notifiche</li>
        <li className="row"><Sparkles size={14} aria-hidden="true" /> Chatta con il coach (solo Premium)</li>
      </ul>
      <p className="muted">
        Free con pubblicita: completa {REWARDED_VIDEOS_REQUIRED} video e sblocca le funzionalita Pro per {REWARDED_UNLOCK_MINUTES} minuti (chat coach esclusa). Max {REWARDED_DAILY_LIMIT} video/giorno, cooldown {REWARDED_COOLDOWN_MINUTES} minuti, {REWARDED_DAILY_UNLOCK_LIMIT} sblocco al giorno.
      </p>
      {rewardedStatus?.reason === 'free_only_plan' ? (
        <div className="row">
          <p className="muted">Passa al piano Free con pubblicita per usare lo sblocco via video.</p>
          <Button type="button" variant="ghost" onClick={onSwitchToFreeAds}>
            Attiva Free con pubblicita
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        icon={PlayCircle}
        onClick={onRewardedUnlock}
        disabled={isPremium || !rewardedStatus?.can_watch_now}
      >
        {rewardedStatus?.is_active ? 'Pro temporaneo attivo' : `Guarda video (${rewardedStatus?.progress_videos ?? 0}/${REWARDED_VIDEOS_REQUIRED})`}
      </Button>
      <RewardedVideoDemoModal
        open={videoModalOpen}
        onClose={() => setVideoModalOpen(false)}
        onCompleted={() => {
          setVideoModalOpen(false);
          redeemRewardedUnlock();
        }}
      />
    </Modal>
  );
}

export default PaywallModal;
