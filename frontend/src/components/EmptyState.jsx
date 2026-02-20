import Button from './Button';
import Card from './Card';
import styles from '../styles/components/emptyState.module.css';

function EmptyState({
  icon: Icon,
  imageSrc,
  imageAlt = '',
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction
}) {
  return (
    <Card className={styles.wrap} aria-live="polite">
      <span className={styles.glow} aria-hidden="true" />
      {Icon ? (
        <span className={styles.iconCircle}>
          <Icon size={22} aria-hidden="true" />
        </span>
      ) : null}
      {imageSrc ? <img src={imageSrc} alt={imageAlt} className={styles.image} loading="lazy" decoding="async" /> : null}
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <div className={styles.actions}>
        {primaryActionLabel ? <Button onClick={onPrimaryAction}>{primaryActionLabel}</Button> : null}
        {secondaryActionLabel ? (
          <Button variant="ghost" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export default EmptyState;
