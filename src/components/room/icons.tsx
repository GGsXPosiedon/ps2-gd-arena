// Small inline icons for the room (stroke icons, 24px grid).
type P = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const MicIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const MicOffIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
    <path d="M4 4l16 16" />
  </svg>
);

export const HandIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8 16" />
  </svg>
);

export const ChatIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H8l-4 4V5z" />
  </svg>
);

export const PhoneDownIcon = ({ className = "h-5 w-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
    <path d="M2.6 14.6c5.2-4.8 13.6-4.8 18.8 0l-2.3 2.3a1 1 0 0 1-1.3.1l-2.4-1.8a1 1 0 0 1-.4-.9l.2-1.9a12.5 12.5 0 0 0-6.4 0l.2 1.9a1 1 0 0 1-.4.9l-2.4 1.8a1 1 0 0 1-1.3-.1l-2.3-2.3z" />
  </svg>
);

export const SendIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <path d="M4 12 20 4l-6 16-2-7-8-1z" />
  </svg>
);

export const KeyboardIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </svg>
);

export function StopwatchIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className}>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14V10.5M10 2h4M12 2v5" />
    </svg>
  );
}
