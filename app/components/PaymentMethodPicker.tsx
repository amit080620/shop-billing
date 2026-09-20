"use client";

import { paymentMethodLabel } from "@/lib/format";
import { useState } from "react";
import { useT } from "@/lib/i18n/LangContext";

const METHODS = ["cash", "card", "upi", "online", "other"] as const;

export function PaymentMethodPicker({ name = "paymentMethod", defaultValue = "cash" }: { name?: string; defaultValue?: string }) {
  const { t } = useT();
  const [selected, setSelected] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{t("Paid via")}</span>
      <input type="hidden" name={name} value={selected} />
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setSelected(m)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              selected === m
                ? "border-brand bg-brand-soft text-brand-text"
                : "border-border text-muted"
            }`}
            style={
              selected === m
                ? { boxShadow: "var(--elev-xs)" }
                : undefined
            }
          >
            {t(paymentMethodLabel(m))}
          </button>
        ))}
      </div>
    </div>
  );
}
