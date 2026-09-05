function BrandLogo({ className = '', decorative = false }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 230"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : 'Motrice'}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <path fill="#c6ff00" d="M44 28 207 176l-23 25L77 103v94H44V28Z" />
      <path fill="#c6ff00" d="M276 28v169h-33v-94l-42 39-23-25 98-89Z" />
    </svg>
  );
}

export default BrandLogo;
