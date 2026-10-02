import buttonStyles from '../styles/components/button.module.css';

function IconButton({
  icon: Icon,
  label,
  className = '',
  iconSize = 18,
  iconStrokeWidth = 2,
  ...props
}) {
  return (
    <button
      type="button"
      className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.iconOnly} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {Icon ? <Icon size={iconSize} strokeWidth={iconStrokeWidth} aria-hidden="true" /> : null}
    </button>
  );
}

export default IconButton;
