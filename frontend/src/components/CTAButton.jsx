import { Link } from 'react-router-dom';
import Button from './Button';
import buttonStyles from '../styles/components/button.module.css';

function CTAButton({ to, children, variant = 'primary', ...rest }) {
  const variantClass = variant === 'secondary' ? buttonStyles.secondary : variant === 'ghost' ? buttonStyles.ghost : '';
  const className = `${buttonStyles.button} ${variantClass}`;

  if (to) {
    return (
      <Link className={className} to={to} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <Button variant={variant} {...rest}>
      {children}
    </Button>
  );
}

export default CTAButton;
