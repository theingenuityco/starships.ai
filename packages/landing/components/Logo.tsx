type Props = {
  size?: number;
  className?: string;
};

export function Logo({ size = 20, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      <circle cx="14.5" cy="9" r="1.5" fill="none" strokeLinecap="butt" />
      <line x1="6" y1="15" x2="2.5" y2="18.5" />
      <line x1="7.5" y1="16.5" x2="5.4" y2="18.6" />
      <line x1="9" y1="18" x2="7.6" y2="19.4" />
    </svg>
  );
}
