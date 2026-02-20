import styles from '../styles/components/button.module.css';

function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  icon: Icon,
  iconRight: IconRight,
  iconSize = 18,
  children,
  ...props
}) {
  const variantClass = variant === 'secondary' ? styles.secondary : variant === 'ghost' ? styles.ghost : '';
  const sizeClass = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : '';
  const fullClass = fullWidth ? styles.full : '';

  return (
    <button className={`${styles.button} ${variantClass} ${sizeClass} ${fullClass} ${className}`.trim()} {...props}>
      {Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}
      <span>{children}</span>
      {IconRight ? <IconRight size={iconSize} aria-hidden="true" /> : null}
    </button>
  );
}

export default Button;
