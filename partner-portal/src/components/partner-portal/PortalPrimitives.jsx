import { memo } from 'react';
import styles from './PortalShared.module.css';

export const PageHero = memo(function PageHero({ title, description, primaryCta, secondaryCta }) {
  return (
    <header className={styles.hero}>
      <h1>{title}</h1>
      <p className={styles.muted}>{description}</p>
      <div className={styles.row}>
        {primaryCta}
        {secondaryCta}
      </div>
    </header>
  );
});

export const PageCard = memo(function PageCard({ title, description, right, children }) {
  return (
    <section className={styles.card}>
      <div className={styles.rowBetween}>
        <h2>{title}</h2>
        {right}
      </div>
      {description ? <p className={styles.muted}>{description}</p> : null}
      {children}
    </section>
  );
});

export const EmptyBlock = memo(function EmptyBlock({ children }) {
  return <div className={styles.empty}>{children}</div>;
});

export const LoadingBlock = memo(function LoadingBlock() {
  return <div className={styles.skeleton} aria-hidden="true" />;
});

export { styles as portalStyles };
