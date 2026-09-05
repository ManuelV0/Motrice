import { useEffect, useState } from 'react';
import BrandLogo from '../BrandLogo';
import styles from '../../styles/components/accountSplash.module.css';

function AccountSplash({ onFinish }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHidden(true);
      if (onFinish) onFinish();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  if (hidden) return null;

  return (
    <div className={`${styles.splash} ${hidden ? styles.hidden : ''}`} aria-live="polite" role="status">
      <BrandLogo className={styles.logoImage} />
      <div className={styles.ring} aria-hidden="true" />
      <p className={styles.tagline}>Caricamento account...</p>
    </div>
  );
}

export default AccountSplash;
