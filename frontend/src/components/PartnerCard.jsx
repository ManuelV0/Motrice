import { memo, useMemo } from 'react';
import { MapPin, QrCode, Tag } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import Badge from './Badge';
import styles from '../styles/components/partnerCard.module.css';

function buildTagList(partner) {
  const tags = [];
  if (partner.kind) tags.push(String(partner.kind));
  const courses = Array.isArray(partner.offered_courses) ? partner.offered_courses : [];
  const promos = Array.isArray(partner.course_promos) ? partner.course_promos : [];
  courses.slice(0, 2).forEach((item) => tags.push(String(item)));
  promos.slice(0, 2).forEach((item) => tags.push(String(item.course_type || '')));
  return Array.from(new Set(tags.filter(Boolean))).slice(0, 3);
}

function PartnerCard({
  partner,
  placeholderImage,
  distanceKm = null,
  promoExpired = false,
  onOpenDetail,
  onOpenVoucher
}) {
  const imageSrc = String(partner.profile_image_data_url || '') || placeholderImage;
  const summary = String(partner.profile_tagline || partner.benefit || 'Vantaggi dedicati alla community Motrice.');
  const promoLine = useMemo(() => {
    const promo = Array.isArray(partner.course_promos) ? partner.course_promos[0] : null;
    if (!promo) return '';
    const type = String(promo.course_type || '').trim();
    if (!type) return '';
    return `Promo ${type}`;
  }, [partner.course_promos]);
  const tags = useMemo(() => buildTagList(partner), [partner]);

  return (
    <Card as="article" className={styles.card} hover>
      <div className={styles.media}>
        <img
          className={styles.image}
          src={imageSrc}
          alt={`Partner ${partner.name}`}
          loading="lazy"
          decoding="async"
          onError={(target) => {
            target.currentTarget.src = '/images/default-sport.svg';
          }}
        />
        <span className={`${styles.promoState} ${promoExpired ? styles.promoStateExpired : styles.promoStateActive}`}>
          {promoExpired ? 'Promo scaduta' : 'Promo attiva'}
        </span>
      </div>

      <div className={styles.body}>
        <header className={styles.header}>
          <h3 className={styles.title}>{partner.name}</h3>
          <p className={styles.city}>
            <MapPin size={14} aria-hidden="true" /> {partner.city || 'n/d'}
          </p>
        </header>

        <div className={styles.tags}>
          {tags.map((tag) => (
            <Badge key={`${partner.id}-${tag}`} tone="sport">
              <Tag size={12} aria-hidden="true" /> {tag}
            </Badge>
          ))}
        </div>

        <p className={styles.summary}>{summary}</p>
        {promoLine ? <p className={styles.summarySecondary}>{promoLine}</p> : null}
        {distanceKm != null ? <p className={styles.distance}>Distanza: {Number(distanceKm).toFixed(1)} km</p> : null}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => onOpenDetail(partner)} aria-label={`Apri offerte di ${partner.name}`}>
            Apri offerte
          </Button>
          <Button
            type="button"
            onClick={() => onOpenVoucher(partner)}
            disabled={promoExpired}
            icon={QrCode}
            aria-label={promoExpired ? `Promo scaduta per ${partner.name}` : `Apri QR per ${partner.name}`}
          >
            Apri QR
          </Button>
        </div>
        {promoExpired ? <p className={styles.disabledHint}>Promo scaduta</p> : null}
      </div>
    </Card>
  );
}

export default memo(PartnerCard);
