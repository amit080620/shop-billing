"use client";

import { useState } from "react";
import { saveLoyaltySettingsAction } from "@/lib/actions/settings";
import { formatMoney } from "@/lib/format";

export function LoyaltySettingsClient({
  pointsPer100,
  redemptionValue,
}: {
  pointsPer100: number;
  redemptionValue: number;
}) {
  const [rate, setRate] = useState(pointsPer100);
  const [value, setValue] = useState(redemptionValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const isEnabled = rate > 0;
  const examplePoints = Math.floor((500 / 100) * rate);
  const exampleValue = examplePoints * value;

  async function save() {
    setError(null);
    setIsSaving(true);
    const result = await saveLoyaltySettingsAction({ pointsPer100: rate, redemptionValue: value });
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="neu-card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Points earned per ₹100 spent</span>
          <span className="text-xs text-muted">
            Set to 0 to keep the loyalty program off — nothing changes for your customers until you set this above 0.
          </span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={rate || ""}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Value of 1 point when redeemed</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={value || ""}
            onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      </div>

      {isEnabled && (
        <div className="neu-card p-4 text-sm">
          <p className="font-medium text-foreground">Example</p>
          <p className="mt-1 text-muted">
            A ₹500 bill earns <span className="font-medium text-brand-text">{examplePoints} points</span>, worth{" "}
            <span className="font-medium text-brand-text">{formatMoney(exampleValue)}</span> the next time they
            redeem.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={save}
        disabled={isSaving}
        className={`btn-primary disabled:opacity-60 ${justSaved ? "animate-save-success" : ""}`}
      >
        {isSaving ? "Saving…" : justSaved ? "Saved ✓" : "Save"}
      </button>

      <p className="text-center text-xs text-muted">
        Points are earned on the paid amount only — never on the udhaar (credit) part of a bill.
      </p>
    </div>
  );
}
