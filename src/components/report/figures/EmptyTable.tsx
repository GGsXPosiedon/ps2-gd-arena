/** Line-art for the silent-session empty state: a round table with your seat empty and a quiet speech bubble. */
export function EmptyTable({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 112" className={className} aria-hidden="true">
      {/* table */}
      <ellipse cx="80" cy="56" rx="44" ry="24" fill="var(--color-surface)" stroke="var(--color-line-2)" />
      <ellipse cx="80" cy="56" rx="36" ry="18" fill="none" stroke="var(--color-line)" strokeDasharray="2 4" />
      {/* other seats */}
      {[
        [80, 18],
        [26, 44],
        [134, 44],
        [36, 82],
        [124, 82],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="var(--color-surface-3)" stroke="var(--color-line-2)" />
      ))}
      {/* your seat: empty */}
      <circle cx="80" cy="96" r="8" fill="none" stroke="var(--color-fg-3)" strokeDasharray="2 3" />
      {/* speech bubble with no words yet */}
      <path
        d="M96 70h28a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-20l-6 5v-5h-2a6 6 0 0 1-6-6V76a6 6 0 0 1 6-6Z"
        fill="none"
        stroke="var(--color-line-2)"
      />
      {[104, 111, 118].map((x) => (
        <circle key={x} cx={x} cy="81" r="1.4" fill="var(--color-fg-3)" />
      ))}
    </svg>
  );
}
