"use client";

import { useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

/** Picks an exact quantity for one item: the number tapped becomes the
 * quantity in the bill, never added on top of what is already there (picking
 * 3 for an item already at 1 makes it 3, not 4). */
export function QuantityGrid({
  productName,
  current,
  onSelect,
  onRemove,
  onClose,
}: {
  productName: string;
  /** The quantity already in the bill, highlighted in the grid. */
  current?: number;
  onSelect: (qty: number) => void;
  /** Given when the item is in the bill: takes it out entirely. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  // Opened by pressing and holding a tile, the grid appears under the finger;
  // lifting it must not pick whatever number is there. A tap only counts once a
  // press has started inside the grid (keyboard presses always count).
  const pressedInside = useRef(false);
  const counts = (e: React.MouseEvent) => e.detail === 0 || pressedInside.current;

  const numbers = Array.from({ length: 50 }, (_, i) => i + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onPointerDown={() => (pressedInside.current = true)}
      onClick={(e) => counts(e) && onClose()}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="truncate text-sm font-semibold text-foreground">{productName}</p>
            <p className="text-xs text-muted">{t("Tap the quantity you want")}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted" aria-label={t("Close")}>
            <X size={18} />
          </button>
        </div>

        {showCustom ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("Custom quantity")}</span>
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
                {t("Back")}
              </button>
              <button
                onClick={() => {
                  const n = Number(customValue);
                  if (Number.isFinite(n) && n > 0) onSelect(n);
                }}
                disabled={!customValue || Number(customValue) <= 0}
                className="btn-primary flex-1 disabled:opacity-40"
              >
                {t("Set")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              {numbers.map((n) => (
                <button
                  key={n}
                  onClick={(e) => counts(e) && onSelect(n)}
                  aria-pressed={n === current}
                  className={`flex aspect-square items-center justify-center rounded-xl text-base font-semibold ${n === current ? "bg-brand text-white" : "bg-background text-foreground"}`}
                  style={{ boxShadow: "var(--elev-xs)" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCustom(true)}
              className="mt-3 w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted"
            >
              {t("More / Custom quantity")}
            </button>
            {onRemove && (
              <button onClick={(e) => counts(e) && onRemove()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-danger">
                <Trash2 size={16} /> {t("Remove from bill")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
