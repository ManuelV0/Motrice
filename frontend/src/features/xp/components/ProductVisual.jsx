import styles from './xpMarketplaceUi.module.css';

function ClothingShape({ kind, gradientId }) {
  if (kind === 'hoodie') {
    return (
      <>
        <path d="M58 31c4-10 13-16 22-16s18 6 22 16l21 13 14 35-20 10-10-22v60H53V67L43 89 23 79l14-35 21-13Z" />
        <path className={styles.visualLine} d="M58 31c7 8 14 12 22 12s15-4 22-12M80 43v84M66 66h28v25H66z" />
      </>
    );
  }
  if (kind === 'shorts') {
    return (
      <>
        <path d="M45 27h70l10 91-38 7-7-51-7 51-38-7 10-91Z" />
        <path className={styles.visualLine} d="M45 42h70M80 42v32" />
      </>
    );
  }
  if (kind === 'leggings') {
    return (
      <>
        <path d="M50 21h60l8 104-29 2-9-66-9 66-29-2 8-104Z" />
        <path className={styles.visualLine} d="M50 38h60M80 38v23" />
      </>
    );
  }
  if (kind === 'cap') {
    return (
      <>
        <path d="M38 74c1-31 20-50 46-50 25 0 39 17 39 43-27 2-48 10-63 23L38 74Z" />
        <path d="M59 88c27-20 57-24 86-10-15 16-50 22-86 10Z" />
        <path className={styles.visualLine} d="M84 24v45M42 70c28-4 54-5 81-3" />
      </>
    );
  }
  if (kind === 'bag') {
    return (
      <>
        <rect x="25" y="53" width="110" height="66" rx="17" />
        <path className={styles.visualLine} d="M56 53V42c0-11 9-19 20-19h8c11 0 20 8 20 19v11M52 53v66M108 53v66" />
      </>
    );
  }
  if (kind === 'top') {
    return (
      <>
        <path d="M59 25c4 8 11 12 21 12s17-4 21-12l14 16-9 19 10 64H44l10-64-9-19 14-16Z" />
        <path className={styles.visualLine} d="M59 25c5 17 37 17 42 0M54 60h52" />
      </>
    );
  }
  return (
    <>
      <path d="M54 24c6 8 15 12 26 12s20-4 26-12l34 27-18 24-16-11v63H54V64L38 75 20 51l34-27Z" />
      <path className={styles.visualLine} d="M54 24c7 18 45 18 52 0M54 64h52" />
    </>
  );
}

export default function ProductVisual({ item, color = 'var(--primary)', large = false }) {
  const safeId = String(item?.id || 'product').replace(/[^a-z0-9-]/gi, '');
  const gradientId = `product-gradient-${safeId}`;
  const isSpecial = Boolean(item?.isSpecial);
  const specialMark = String(item?.name || 'M').slice(0, 1);
  const isWidePhoto = item?.visual === 'cap' || item?.visual === 'bag';

  if (item?.image) {
    const crop = item.imageCrop;
    return (
      <div
        className={`${styles.productVisual} ${styles.productVisualPhoto} ${isWidePhoto ? styles.productVisualPhotoWide : styles.productVisualPhotoTall} ${large ? styles.productVisualLarge : ''}`}
        style={{ '--product-accent': color, '--product-image': `url("${item.image}")` }}
      >
        {crop ? (
          <svg
            className={styles.productPhoto}
            viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
            role="img"
            aria-label={`Anteprima ${item?.name || 'capo Motrice'}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <image href={item.image} x="0" y="0" width={crop.sourceWidth} height={crop.sourceHeight} />
          </svg>
        ) : (
          <span
            className={styles.productImage}
            role="img"
            aria-label={`Anteprima ${item?.name || 'capo Motrice'}`}
            style={{ backgroundImage: `url("${item.image}")` }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.productVisual} ${large ? styles.productVisualLarge : ''}`} style={{ '--product-accent': color }}>
      <svg viewBox="0 0 160 145" role="img" aria-label={`Anteprima ${item?.name || 'capo Motrice'}`}>
        <defs>
          <linearGradient id={gradientId} x1="20%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stopColor="#34373a" />
            <stop offset="50%" stopColor="#151719" />
            <stop offset="100%" stopColor="#070809" />
          </linearGradient>
        </defs>
        <g className={styles.visualGarment} fill={`url(#${gradientId})`}>
          <ClothingShape kind={isSpecial ? 'hoodie' : item?.visual} gradientId={gradientId} />
        </g>
        <path className={styles.visualAccent} d="M51 119h58" />
        <g className={styles.visualMark}>
          <path d="M69 67 80 60l11 7v14L80 88l-11-7V67Z" />
          <text x="80" y="78" textAnchor="middle">{isSpecial ? specialMark : 'M'}</text>
        </g>
      </svg>
    </div>
  );
}
