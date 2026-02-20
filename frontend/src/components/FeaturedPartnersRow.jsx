import { Sparkles } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import styles from '../styles/components/featuredPartnersRow.module.css';

function FeaturedPartnersRow({ partners, onOpenDetail, onOpenVoucher, isPromoExpired }) {
  if (!partners.length) return null;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2>
          <Sparkles size={16} aria-hidden="true" /> In primo piano
        </h2>
        <p className={styles.hint}>Partner con promo attive e ranking migliore.</p>
      </div>
      <div className={styles.row} role="list" aria-label="Partner in primo piano">
        {partners.map((partner) => {
          const expired = isPromoExpired(partner);
          return (
            <article key={`featured-${partner.id}`} className={styles.item} role="listitem">
              <h3>{partner.name}</h3>
              <p>{partner.city}</p>
              <div className={styles.actions}>
                <Button type="button" variant="secondary" onClick={() => onOpenDetail(partner)}>
                  Apri offerte
                </Button>
                <Button type="button" onClick={() => onOpenVoucher(partner)} disabled={expired}>
                  Apri QR
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export default FeaturedPartnersRow;
