function BrandLogo({ className = '', decorative = false, loading = 'eager' }) {
  return (
    <img
      className={className}
      src="/images/motrice-logo.png"
      alt={decorative ? '' : 'Motrice'}
      aria-hidden={decorative ? 'true' : undefined}
      width="512"
      height="512"
      loading={loading}
      decoding="async"
    />
  );
}

export default BrandLogo;
