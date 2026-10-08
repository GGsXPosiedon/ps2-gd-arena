/** GD Arena mark: a round table with seats around it; the larger seat is the one speaking. Uses currentColor. */
export function LogoMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="4.5" r="3" fill="currentColor" />
      <circle cx="27.5" cy="16" r="2" fill="currentColor" />
      <circle cx="16" cy="27.5" r="2" fill="currentColor" />
      <circle cx="4.5" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
