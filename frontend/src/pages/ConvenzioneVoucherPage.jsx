import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, MapPin, QrCode, ShieldAlert, ShieldCheck } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import Card from '../components/Card';
import Button from '../components/Button';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import { getPartnerById } from '../data/convenzioniData';
import { ensureLeafletIcons } from '../features/coach/utils/leafletIconFix';
import styles from '../styles/pages/convenzioneVoucher.module.css';

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/d';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimer(msLeft) {
  if (msLeft <= 0) return '00:00:00';
  const totalSeconds = Math.floor(msLeft / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function ConvenzioneVoucherPage() {
  ensureLeafletIcons();
  const navigate = useNavigate();
  const { voucherId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  usePageMeta({
    title: 'Buono Convenzione | Motrice',
    description: 'Verifica buono convenzione con QR code, validita temporale e mappa partner.'
  });

  useEffect(() => {
    let active = true;
    async function loadVoucher() {
      setLoading(true);
      setError('');
      try {
        const item = await api.getConventionVoucher(voucherId);
        if (!active) return;
        setVoucher(item);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Impossibile verificare il buono');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadVoucher();
    return () => {
      active = false;
    };
  }, [voucherId]);

  useEffect(() => {
    if (!voucher) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [voucher]);

  const partner = useMemo(() => {
    if (!voucher?.partner?.id) return null;
    return getPartnerById(voucher.partner.id);
  }, [voucher]);

  if (loading) return <LoadingSkeleton rows={3} />;

  if (error) {
    return (
      <section className={styles.page}>
        <Card className={styles.errorCard}>
          <p className={styles.kicker}>
            <ShieldAlert size={15} aria-hidden="true" /> Verifica buono
          </p>
          <h1>Buono non valido</h1>
          <p className="muted">{error}</p>
          <Button type="button" onClick={() => navigate('/convenzioni')}>Torna a convenzioni</Button>
        </Card>
      </section>
    );
  }

  const expiresMs = Date.parse(voucher?.expires_at || '');
  const remainingMs = Number.isFinite(expiresMs) ? Math.max(0, expiresMs - nowMs) : 0;
  const isRedeemed = voucher?.status === 'redeemed';
  const isExpired = !isRedeemed && (remainingMs <= 0 || voucher?.status === 'expired');
  const isActive = !isExpired && !isRedeemed;
  const title = partner?.name || voucher?.partner?.name || 'Convenzione';
  const city = partner?.city || voucher?.partner?.city || '';
  const kind = partner?.kind || voucher?.partner?.kind || '';
  const promoExpiresAt = partner?.promo_expires_at || voucher?.partner?.promo_expires_at || '';
  const lat = Number.isFinite(Number(partner?.lat)) ? Number(partner?.lat) : Number(voucher?.partner?.lat);
  const lng = Number.isFinite(Number(partner?.lng)) ? Number(partner?.lng) : Number(voucher?.partner?.lng);
  const hasMap = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <section className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <ShieldCheck size={15} aria-hidden="true" /> Buono convenzione verificato
        </p>
        <h1>{title}</h1>
        <p className="muted">
          Valido solo per account registrati. {kind ? `${kind} · ` : ''}{city}
        </p>
        {promoExpiresAt ? (
          <p className={styles.promoDeadline}>
            Scadenza promozione partner: <strong>{formatDateTime(promoExpiresAt)}</strong>
          </p>
        ) : null}
      </Card>

      <Card className={styles.voucherCard}>
        <div className={styles.qrWrap}>
          <div className={styles.qrHead}>
            <QrCode size={18} aria-hidden="true" />
            <h2>QR di verifica</h2>
          </div>
          <img className={styles.qrImage} src={voucher.qr_url} alt={`QR buono ${title}`} loading="lazy" />
          <p className="muted">{voucher.id}</p>
        </div>

        <div className={styles.meta}>
          <p className={styles.statusLine}>
            {isExpired ? <ShieldAlert size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
            <strong>{isRedeemed ? 'Buono gia utilizzato' : isExpired ? 'Buono scaduto' : 'Buono valido'}</strong>
          </p>
          <p><strong>Creato:</strong> {formatDateTime(voucher.created_at)}</p>
          <p><strong>Scadenza:</strong> {formatDateTime(voucher.expires_at)}</p>
          <p>
            <strong>Costo buono:</strong>{' '}
            {Number(voucher.cost_cents || 0) > 0
              ? `${(Number(voucher.cost_cents) / 100).toFixed(2)} EUR da salvadanaio`
              : 'Incluso con Premium'}
          </p>
          {isActive ? (
            <p className={styles.timerLine}>
              <Clock3 size={16} aria-hidden="true" />
              <span>Timer residuo: <strong>{formatTimer(remainingMs)}</strong></span>
            </p>
          ) : null}
          {isRedeemed ? (
            <p className="muted">
              Utilizzato il: <strong>{formatDateTime(voucher.redeemed_at)}</strong>
            </p>
          ) : null}
          <p className="muted">Mostra questo QR al partner aderente per conferma del buono.</p>
          <Button type="button" variant="secondary" onClick={() => navigate('/convenzioni')}>
            Torna al catalogo convenzioni
          </Button>
        </div>
      </Card>

      {hasMap ? (
        <Card className={styles.mapCard}>
          <h2>
            <MapPin size={16} aria-hidden="true" /> Mappa convenzione specifica
          </h2>
          <p className="muted">{title} {city ? `· ${city}` : ''}</p>
          <MapContainer center={[lat, lng]} zoom={13} className={styles.mapFrame}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[lat, lng]}>
              <Popup>
                <strong>{title}</strong>
                <br />
                {city}
              </Popup>
            </Marker>
          </MapContainer>
        </Card>
      ) : null}
    </section>
  );
}

export default ConvenzioneVoucherPage;
