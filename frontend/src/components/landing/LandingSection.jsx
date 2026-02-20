import styles from '../../styles/components/landingSection.module.css';

function LandingSection({
  id,
  kicker,
  title,
  description,
  className = '',
  actions = null,
  children
}) {
  return (
    <section id={id} className={`${styles.section} ${className}`.trim()} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className={styles.head}>
        {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
        {title ? <h2 id={id ? `${id}-title` : undefined}>{title}</h2> : null}
        {description ? <p className={styles.description}>{description}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export default LandingSection;
