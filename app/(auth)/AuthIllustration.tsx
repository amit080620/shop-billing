"use client";

import { useEffect, useState } from "react";

const SCENE_COUNT = 5;

export function AuthIllustration() {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScene((s) => (s + 1) % SCENE_COUNT), 3500);
    return () => clearInterval(id);
  }, []);

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

      {/* Soft ambient glow behind the whole scene — stays constant across all scenes */}
      <circle cx="200" cy="190" r="150" fill="var(--brand-soft)" opacity="0.6" className="illus-pulse" />

      {scene === 0 && <BillScene key="bill" />}
      {scene === 1 && <TruckScene key="truck" />}
      {scene === 2 && <RepairScene key="repair" />}
      {scene === 3 && <ClinicScene key="clinic" />}
      {scene === 4 && <JewelleryScene key="jewellery" />}
    </svg>
  );
}

function BillScene() {
  return (
    <g className="illus-scene-enter">
      <g filter="url(#softShadowSm)" transform="translate(230 60) rotate(8)" className="illus-float-1">
        <rect width="130" height="90" rx="14" fill="#ffffff" />
        <rect x="14" y="16" width="60" height="8" rx="4" fill="#e5e7eb" />
        <polyline points="14,68 34,52 52,60 72,38 100,46 116,28" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <g filter="url(#softShadowSm)" transform="translate(48 200) rotate(-10)" className="illus-float-2">
        <circle r="34" cx="34" cy="34" fill="url(#chipGrad)" />
        <text x="34" y="42" textAnchor="middle" fontSize="28" fontWeight="700" fill="white">₹</text>
      </g>
      <g filter="url(#softShadow)" transform="translate(90 110)">
        <rect width="220" height="260" rx="20" fill="#ffffff" />
        <rect x="0" y="0" width="220" height="64" rx="20" fill="url(#cardGrad)" />
        <rect x="0" y="44" width="220" height="20" fill="url(#cardGrad)" />
        <circle cx="32" cy="32" r="14" fill="white" fillOpacity="0.25" />
        <rect x="56" y="24" width="90" height="8" rx="4" fill="white" fillOpacity="0.85" />
        <rect x="56" y="38" width="60" height="6" rx="3" fill="white" fillOpacity="0.55" />
        <rect x="24" y="88" width="120" height="7" rx="3.5" fill="#111827" opacity="0.8" />
        <rect x="24" y="104" width="80" height="6" rx="3" fill="#6b7280" opacity="0.6" />
        <rect x="176" y="88" width="20" height="7" rx="3.5" fill="#111827" opacity="0.8" />
        <rect x="24" y="128" width="100" height="7" rx="3.5" fill="#111827" opacity="0.8" />
        <rect x="24" y="144" width="70" height="6" rx="3" fill="#6b7280" opacity="0.6" />
        <rect x="176" y="128" width="20" height="7" rx="3.5" fill="#111827" opacity="0.8" />
        <line x1="24" y1="176" x2="196" y2="176" stroke="#e5e7eb" strokeWidth="2" />
        <rect x="24" y="196" width="60" height="10" rx="5" fill="#6b7280" opacity="0.7" />
        <rect x="130" y="192" width="66" height="18" rx="6" fill="var(--brand-soft)" />
        <rect x="138" y="197" width="50" height="8" rx="4" fill="var(--brand-dark)" />
        <g filter="url(#softShadowSm)" transform="translate(168 224)">
          <circle r="34" cx="26" cy="26" fill="var(--success)" opacity="0.25" className="illus-pulse" />
          <circle r="26" cx="26" cy="26" fill="var(--success)" />
          <path d="M15 27l7 7 15-15" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
    </g>
  );
}

function TruckScene() {
  return (
    <g className="illus-scene-enter">
      <g filter="url(#softShadow)" transform="translate(60 150)" className="illus-truck-body">
        {/* cargo box */}
        <rect x="0" y="0" width="150" height="90" rx="10" fill="#ffffff" />
        <rect x="12" y="16" width="70" height="8" rx="4" fill="#e5e7eb" />
        <rect x="12" y="34" width="100" height="7" rx="3.5" fill="#9ca3af" opacity="0.7" />
        <rect x="12" y="50" width="80" height="7" rx="3.5" fill="#9ca3af" opacity="0.5" />
        {/* cab */}
        <path d="M150 30 h50 a14 14 0 0 1 14 14 v46 h-64 z" fill="url(#cardGrad)" />
        <rect x="164" y="42" width="34" height="24" rx="4" fill="white" fillOpacity="0.85" />
        {/* wheels */}
        <g transform="translate(38 90)">
          <circle r="18" fill="#1f2937" />
          <g className="illus-wheel">
            <circle r="9" fill="#9ca3af" />
            <rect x="-2" y="-9" width="4" height="18" fill="#4b5563" />
            <rect x="-9" y="-2" width="18" height="4" fill="#4b5563" />
          </g>
        </g>
        <g transform="translate(178 90)">
          <circle r="18" fill="#1f2937" />
          <g className="illus-wheel">
            <circle r="9" fill="#9ca3af" />
            <rect x="-2" y="-9" width="4" height="18" fill="#4b5563" />
            <rect x="-9" y="-2" width="18" height="4" fill="#4b5563" />
          </g>
        </g>
      </g>
      {/* motion lines */}
      <g opacity="0.5" className="illus-float-2">
        <rect x="30" y="200" width="26" height="5" rx="2.5" fill="white" />
        <rect x="20" y="215" width="18" height="5" rx="2.5" fill="white" />
      </g>
      {/* floating package */}
      <g filter="url(#softShadowSm)" transform="translate(250 70) rotate(-8)" className="illus-float-1">
        <rect width="80" height="80" rx="12" fill="#ffffff" />
        <path d="M0 24 H80 M40 24 V80" stroke="#d1d5db" strokeWidth="4" />
        <rect x="14" y="6" width="28" height="10" rx="5" fill="var(--brand-soft)" />
      </g>
    </g>
  );
}

function RepairScene() {
  return (
    <g className="illus-scene-enter">
      <g filter="url(#softShadow)" transform="translate(100 120)">
        <rect width="200" height="200" rx="24" fill="#ffffff" />
        {/* wrench */}
        <g transform="translate(100 105)" className="illus-wrench">
          <rect x="-9" y="-15" width="18" height="80" rx="9" fill="#6b7280" />
          <circle cx="0" cy="-40" r="28" fill="none" stroke="#6b7280" strokeWidth="14" />
          <circle cx="0" cy="-40" r="14" fill="var(--brand-soft)" />
          <circle cx="0" cy="68" r="16" fill="#4b5563" />
          <circle cx="0" cy="68" r="7" fill="var(--brand-soft)" />
        </g>
      </g>
      {/* floating bolt */}
      <g filter="url(#softShadowSm)" transform="translate(240 80)" className="illus-float-1">
        <circle r="30" fill="url(#chipGrad)" />
        <circle r="12" fill="white" fillOpacity="0.9" />
        <rect x="-3" y="-15" width="6" height="10" fill="white" fillOpacity="0.9" />
        <rect x="-3" y="5" width="6" height="10" fill="white" fillOpacity="0.9" />
        <rect x="-15" y="-3" width="10" height="6" fill="white" fillOpacity="0.9" />
        <rect x="5" y="-3" width="10" height="6" fill="white" fillOpacity="0.9" />
      </g>
      {/* floating spark badge */}
      <g filter="url(#softShadowSm)" transform="translate(56 220) rotate(-8)" className="illus-float-2">
        <circle r="28" cx="28" cy="28" fill="var(--success)" opacity="0.9" />
        <path d="M30 12 L18 32 h9 l-3 16 15-22 h-9 z" fill="white" />
      </g>
    </g>
  );
}

function ClinicScene() {
  return (
    <g className="illus-scene-enter">
      <g filter="url(#softShadow)" transform="translate(100 100)">
        <rect width="200" height="220" rx="24" fill="#ffffff" />
        {/* stethoscope */}
        <g transform="translate(100 40)" className="illus-stetho">
          <path d="M-40 0 v40 a40 40 0 0 0 80 0 v-40" stroke="#6b7280" strokeWidth="8" strokeLinecap="round" fill="none" />
          <circle cx="-40" cy="-8" r="9" fill="#6b7280" />
          <circle cx="40" cy="-8" r="9" fill="#6b7280" />
          <path d="M0 40 v50" stroke="#6b7280" strokeWidth="8" strokeLinecap="round" />
          <circle cx="0" cy="102" r="20" fill="var(--brand)" />
          <circle cx="0" cy="102" r="10" fill="var(--brand-dark)" />
        </g>
      </g>
      {/* heartbeat line */}
      <g filter="url(#softShadowSm)" transform="translate(230 250) rotate(-4)" className="illus-float-2">
        <rect width="110" height="60" rx="12" fill="#ffffff" />
        <polyline points="10,32 30,32 38,14 50,48 60,20 70,32 100,32" stroke="var(--danger, #dc2626)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      {/* floating plus/cross badge */}
      <g filter="url(#softShadowSm)" transform="translate(46 90)" className="illus-float-1">
        <circle r="26" fill="var(--brand-soft)" />
        <rect x="-4" y="-14" width="8" height="28" rx="4" fill="var(--brand-dark)" />
        <rect x="-14" y="-4" width="28" height="8" rx="4" fill="var(--brand-dark)" />
      </g>
    </g>
  );
}

function JewelleryScene() {
  return (
    <g className="illus-scene-enter">
      <g filter="url(#softShadow)" transform="translate(100 110)">
        <rect width="200" height="200" rx="24" fill="#ffffff" />
        {/* diamond */}
        <g transform="translate(100 100)">
          <polygon points="0,-55 40,-15 0,65 -40,-15" fill="url(#chipGrad)" />
          <polygon points="0,-55 40,-15 0,-15" fill="white" fillOpacity="0.35" />
          <polygon points="-40,-15 40,-15 0,65" fill="black" fillOpacity="0.06" />
          <line x1="-40" y1="-15" x2="40" y2="-15" stroke="white" strokeOpacity="0.5" strokeWidth="2" />
          <line x1="0" y1="-55" x2="0" y2="65" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" />
          {/* shine sweep */}
          <clipPath id="gemClip">
            <polygon points="0,-55 40,-15 0,65 -40,-15" />
          </clipPath>
          <g clipPath="url(#gemClip)">
            <rect x="-60" y="-70" width="30" height="150" fill="white" opacity="0.6" className="illus-gem-shine" />
          </g>
        </g>
      </g>
      {/* sparkles */}
      <g fill="white" className="illus-sparkle">
        <polygon points="260,70 264,82 276,86 264,90 260,102 256,90 244,86 256,82" />
      </g>
      <g fill="white" className="illus-sparkle" style={{ animationDelay: "0.5s" }}>
        <polygon points="70,220 73,229 82,232 73,235 70,244 67,235 58,232 67,229" />
      </g>
      {/* floating ring */}
      <g filter="url(#softShadowSm)" transform="translate(60 90)" className="illus-float-2">
        <circle r="26" cx="26" cy="26" fill="none" stroke="url(#chipGrad)" strokeWidth="8" />
        <polygon points="26,4 34,16 26,28 18,16" fill="var(--brand)" />
      </g>
    </g>
  );
}
