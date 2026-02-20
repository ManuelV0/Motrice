import { forwardRef } from 'react';
import styles from '../styles/components/card.module.css';

const Card = forwardRef(function Card(
  { as: Tag = 'section', className = '', children, subtle = false, hover = false, ...props },
  ref
) {
  const subtleClass = subtle ? styles.subtle : '';
  const hoverClass = hover ? styles.hover : '';

  return (
    <Tag ref={ref} className={`${styles.card} ${subtleClass} ${hoverClass} ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
});

export default Card;
