export function AuthIllustration() {
  return (
    <svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
      <defs>
        <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-light)" />
          <stop offset="100%" stopColor="var(--brand-dark)" />
        </linearGradient>
        <linearGradient id="chipGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0.6" />
        </linearGradient>
        <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000" floodOpacity="0.18" />
        </filter>
        <filter id="softShadowSm" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* Soft ambient glow behind the whole scene */}
      <circle cx="200" cy="190" r="150" fill="var(--brand-soft)" opacity="0.6" className="illus-pulse" />

      {/* Back layer: a floating stat/chart card, tilted for depth */}
      <g filter="url(#softShadowSm)" transform="translate(230 60) rotate(8)" className="illus-float-1">
        <rect width="130" height="90" rx="14" fill="var(--surface)" />
        <rect x="14" y="16" width="60" height="8" rx="4" fill="var(--border)" />
        <polyline points="14,68 34,52 52,60 72,38 100,46 116,28" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* Back layer: a floating coin/payment chip */}
      <g filter="url(#softShadowSm)" transform="translate(48 200) rotate(-10)" className="illus-float-2">
        <circle r="34" cx="34" cy="34" fill="url(#chipGrad)" />
        <text x="34" y="42" textAnchor="middle" fontSize="28" fontWeight="700" fill="white">₹</text>
      </g>

      {/* Main layer: the invoice/bill card, front and center */}
      <g filter="url(#softShadow)" transform="translate(90 110)">
        <rect width="220" height="260" rx="20" fill="var(--surface)" />
        <rect x="0" y="0" width="220" height="64" rx="20" fill="url(#cardGrad)" />
        <rect x="0" y="44" width="220" height="20" fill="url(#cardGrad)" />
        <circle cx="32" cy="32" r="14" fill="white" fillOpacity="0.25" />
        <rect x="56" y="24" width="90" height="8" rx="4" fill="white" fillOpacity="0.85" />
        <rect x="56" y="38" width="60" height="6" rx="3" fill="white" fillOpacity="0.55" />

        {/* line items */}
        <rect x="24" y="88" width="120" height="7" rx="3.5" fill="var(--foreground)" opacity="0.8" />
        <rect x="24" y="104" width="80" height="6" rx="3" fill="var(--muted)" opacity="0.6" />
        <rect x="176" y="88" width="20" height="7" rx="3.5" fill="var(--foreground)" opacity="0.8" />

        <rect x="24" y="128" width="100" height="7" rx="3.5" fill="var(--foreground)" opacity="0.8" />
        <rect x="24" y="144" width="70" height="6" rx="3" fill="var(--muted)" opacity="0.6" />
        <rect x="176" y="128" width="20" height="7" rx="3.5" fill="var(--foreground)" opacity="0.8" />

        <line x1="24" y1="176" x2="196" y2="176" stroke="var(--border)" strokeWidth="2" />

        {/* total, emphasized */}
        <rect x="24" y="196" width="60" height="10" rx="5" fill="var(--muted)" opacity="0.7" />
        <rect x="130" y="192" width="66" height="18" rx="6" fill="var(--brand-soft)" />
        <rect x="138" y="197" width="50" height="8" rx="4" fill="var(--brand-dark)" />

        {/* success checkmark badge, bottom-right, overlapping edge */}
        <g filter="url(#softShadowSm)" transform="translate(168 224)">
          <circle r="34" cx="26" cy="26" fill="var(--success)" opacity="0.25" className="illus-pulse" />
          <circle r="26" cx="26" cy="26" fill="var(--success)" />
          <path d="M15 27l7 7 15-15" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}
