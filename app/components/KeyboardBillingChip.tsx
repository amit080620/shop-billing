"use client";

import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { setKeyboardBilling } from "@/lib/keyboardBilling";
import { useT } from "@/lib/i18n/LangContext";

/** On a computer's billing screen: keyboard billing at a glance — switch it on where the bill is
 * made (it used to hide in print set-up), and F1 for the keys. */
export function KeyboardBillingChip({ on, onHelp }: { on: boolean; onHelp: () => void }) {
  const { t } = useT();
  return (
    <span className="no-print hidden items-center gap-1.5 md:flex">
      <button
        type="button"
        onClick={() => setKeyboardBilling(!on)}
        className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-brand bg-brand text-white" : "border-border text-muted hover:text-foreground"}`}
        aria-pressed={on}
        title={t("Bill with the keyboard, no mouse — like Marg")}
      >
        <Keyboard size={13} /> {on ? t("Keyboard billing on") : t("Keyboard billing")}
      </button>
      {on && (
        <button type="button" onClick={onHelp} className="rounded-full border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:text-foreground">
          F1 · {t("Keys")}
        </button>
      )}
    </span>
  );
}

const SELLING_KEYS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Adding items",
    keys: [
      ["Scan / type + Enter", "Add the item"],
      ["+  −", "Quantity of the chosen line"],
      ["↑  ↓", "Choose a line"],
      ["F2", "Type the quantity"],
      ["Delete", "Remove the chosen line"],
      ["F3", "Choose the customer"],
      ["Enter", "On an empty search: go to payment"],
    ],
  },
  {
    title: "Payment",
    keys: [
      ["F2", "Discount"],
      ["F3", "Amount paid"],
      ["F4", "Next payment mode"],
      ["Enter", "Save the bill"],
      ["Esc", "Back to the items"],
    ],
  },
  {
    title: "Anywhere",
    keys: [
      ["F10 / Ctrl + Enter", "Save at once"],
      ["F1", "These keys"],
    ],
  },
  {
    title: "Printed bill",
    keys: [
      ["Enter / P", "Print"],
      ["N / Esc", "Next bill"],
    ],
  },
];

/** Every selling key on one sheet. Esc or F1 closes it. */
export function SellingKeysSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F1") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("Selling shortcuts")}>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Keyboard size={16} /> {t("Selling shortcuts")}
          </p>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="text-muted">
            <X size={16} />
          </button>
        </div>
        {SELLING_KEYS.map((g) => (
          <section key={g.title} className="mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t(g.title)}</p>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {g.keys.map(([k, what]) => (
                <li key={k + what} className="flex items-center justify-between gap-3 py-1.5">
                  <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-foreground">{k}</kbd>
                  <span className="text-right text-xs text-muted">{t(what)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
