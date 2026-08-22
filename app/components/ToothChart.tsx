"use client";

import { useState } from "react";
import { Smile } from "lucide-react";

export const TOOTH_CONDITIONS = ["healthy", "cavity", "filled", "missing", "crown", "root_canal", "extraction", "bridge", "implant", "sealant"] as const;
export const CONDITION_COLORS: Record<string, string> = {
  healthy: "bg-surface border-border text-muted",
  cavity: "bg-red-100 border-red-400 text-red-700",
  filled: "bg-blue-100 border-blue-400 text-blue-700",
  missing: "bg-gray-200 border-gray-400 text-gray-500",
  crown: "bg-amber-100 border-amber-400 text-amber-700",
  root_canal: "bg-purple-100 border-purple-400 text-purple-700",
  extraction: "bg-rose-100 border-rose-400 text-rose-700",
  bridge: "bg-cyan-100 border-cyan-400 text-cyan-700",
  implant: "bg-emerald-100 border-emerald-400 text-emerald-700",
  sealant: "bg-lime-100 border-lime-400 text-lime-700",
};
export const CONDITION_LABELS: Record<string, string> = {
  healthy: "Healthy",
  cavity: "Cavity",
  filled: "Filled",
  missing: "Missing",
  crown: "Crown",
  root_canal: "Root canal (RCT)",
  extraction: "Extraction",
  bridge: "Bridge",
  implant: "Implant",
  sealant: "Sealant",
};
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

/** A genuine small SVG tooth icon whose visual treatment changes per
 * condition — Crown genuinely shows a cap, RCT genuinely highlights
 * the root, etc., rather than just a differently-colored number. */
export function ToothIcon({ condition, size = 22 }: { condition: string; size?: number }) {
  const crownFill =
    condition === "cavity" ? "#f87171" : condition === "filled" ? "#93c5fd" : condition === "missing" ? "none" : "#fefce8";
  const rootFill = condition === "root_canal" ? "#dc2626" : condition === "missing" ? "none" : "#fef3c7";
  const strokeColor = condition === "missing" ? "#9ca3af" : "#78716c";
  const strokeDash = condition === "missing" ? "2 2" : undefined;

  return (
    <svg width={size} height={size} viewBox="0 0 24 28" fill="none">
      <path
        d="M9 15 L8 25 Q8 27 9.5 26.5 L11 19 L13 19 L14.5 26.5 Q16 27 16 25 L15 15 Z"
        fill={rootFill}
        stroke={strokeColor}
        strokeWidth="1"
        strokeDasharray={strokeDash}
      />
      <path
        d="M12 2 C6 2 4 6 4 9 C4 12.5 6 15 9 15.5 L15 15.5 C18 15 20 12.5 20 9 C20 6 18 2 12 2 Z"
        fill={crownFill}
        stroke={strokeColor}
        strokeWidth="1.3"
        strokeDasharray={strokeDash}
      />
      {condition === "crown" && (
        <path
          d="M12 2 C6 2 4 6 4 9 C4 12.5 6 15 9 15.5 L15 15.5 C18 15 20 12.5 20 9 C20 6 18 2 12 2 Z"
          fill="url(#goldCap)"
          stroke="#b45309"
          strokeWidth="1.3"
        />
      )}
      {condition === "crown" && (
        <defs>
          <linearGradient id="goldCap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
      )}
      {condition === "bridge" && <rect x="2" y="7" width="20" height="3" rx="1.5" fill="#0891b2" opacity="0.85" />}
      {condition === "implant" && <rect x="10.5" y="14" width="3" height="12" fill="#6b7280" />}
      {condition === "sealant" && <path d="M6 6 Q12 3 18 6" stroke="#65a30d" strokeWidth="1.5" fill="none" />}
      {condition === "extraction" && <line x1="3" y1="4" x2="21" y2="24" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

/** The genuine shared tooth chart — tap a tooth number, pick a
 * procedure directly from a popup (RCT, Crown, etc.), used identically
 * in both Prescriptions and Treatment Plans, so a doctor's tooth-level
 * work is genuinely captured the same way everywhere in the app. */
export function ToothChart({ chart, onChange }: { chart: Record<string, string>; onChange: (chart: Record<string, string>) => void }) {
  const [openTooth, setOpenTooth] = useState<number | null>(null);

  function selectCondition(tooth: number, condition: string) {
    const updated = { ...chart };
    if (condition === "healthy") delete updated[tooth];
    else updated[tooth] = condition;
    onChange(updated);
    setOpenTooth(null);
  }

  function ToothButton({ tooth }: { tooth: number }) {
    const condition = chart[tooth] ?? "healthy";
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenTooth(openTooth === tooth ? null : tooth)}
          className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-lg border ${CONDITION_COLORS[condition]}`}
          title={CONDITION_LABELS[condition]}
        >
          <ToothIcon condition={condition} size={18} />
          <span className="text-[9px] font-semibold leading-none">{tooth}</span>
        </button>

        {openTooth === tooth && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenTooth(null)} />
            <div
              className="absolute left-1/2 top-full z-50 mt-1.5 w-44 -translate-x-1/2 rounded-xl border border-border bg-surface p-1.5"
              style={{ boxShadow: "-4px -4px 10px var(--neu-light), 4px 4px 12px var(--neu-dark)" }}
            >
              <p className="px-2 py-1 text-[10px] font-semibold text-muted">Tooth {tooth} — pick a procedure</p>
              {TOOTH_CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => selectCondition(tooth, c)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                    condition === c ? "bg-brand-soft font-semibold text-brand-text" : "text-foreground hover:bg-background"
                  }`}
                >
                  <ToothIcon condition={c} size={16} />
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Smile size={14} /> Tooth chart</p>
      <p className="text-xs text-muted">Tap a tooth to pick its procedure directly — Crown shows a cap, RCT highlights the root.</p>
      <div className="flex flex-col items-center gap-2 overflow-visible">
        <div className="flex gap-1">
          {UPPER_RIGHT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
          <span className="w-2" />
          {UPPER_LEFT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
        </div>
        <div className="flex gap-1">
          {LOWER_RIGHT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
          <span className="w-2" />
          {LOWER_LEFT.map((t) => (
            <ToothButton key={t} tooth={t} />
          ))}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {TOOTH_CONDITIONS.filter((c) => c !== "healthy").map((c) => (
          <span key={c} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONDITION_COLORS[c]}`}>
            <ToothIcon condition={c} size={12} />
            {CONDITION_LABELS[c]}
          </span>
        ))}
      </div>
    </section>
  );
}

/** A genuine static (read-only, no popups) render of the tooth chart —
 * used on the printed quotation, where the patient just needs to SEE
 * which teeth are being treated, not tap anything. */
export function ToothChartStatic({ chart }: { chart: Record<string, string> }) {
  function Tooth({ tooth }: { tooth: number }) {
    const condition = chart[tooth] ?? "healthy";
    return (
      <div className={`flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded border ${CONDITION_COLORS[condition]}`}>
        <ToothIcon condition={condition} size={14} />
        <span className="text-[8px] font-semibold leading-none">{tooth}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex gap-0.5">
        {UPPER_RIGHT.map((t) => <Tooth key={t} tooth={t} />)}
        <span className="w-1.5" />
        {UPPER_LEFT.map((t) => <Tooth key={t} tooth={t} />)}
      </div>
      <div className="flex gap-0.5">
        {LOWER_RIGHT.map((t) => <Tooth key={t} tooth={t} />)}
        <span className="w-1.5" />
        {LOWER_LEFT.map((t) => <Tooth key={t} tooth={t} />)}
      </div>
    </div>
  );
}
