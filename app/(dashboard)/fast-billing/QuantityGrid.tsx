"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function QuantityGrid({
  productName,
  onSelect,
  onClose,
}: {
  productName: string;
  onSelect: (qty: number) => void;
  onClose: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const numbers = Array.from({ length: 50 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="truncate pr-2 text-sm font-semibold text-foreground">{productName}</p>
          <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {showCustom ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Custom quantity</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="rounded-lg border border-border px-3 py-3 text-lg outline-none focus:border-brand"
                placeholder="e.g. 125"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowCustom(false)} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground">
                Back
              </button>
              <button
                onClick={() => {
                  const n = Number(customValue);
                  if (Number.isFinite(n) && n > 0) onSelect(n);
                }}
                disabled={!customValue || Number(customValue) <= 0}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              {numbers.map((n) => (
                <button
                  key={n}
                  onClick={() => onSelect(n)}
                  className="flex aspect-square items-center justify-center rounded-xl bg-background text-base font-semibold text-foreground"
                  style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCustom(true)}
              className="mt-3 w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted"
            >
              More / Custom quantity
            </button>
          </>
        )}
      </div>
    </div>
  );
}
