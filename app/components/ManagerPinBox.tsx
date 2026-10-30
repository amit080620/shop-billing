"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

/** Asks for the manager PIN before a guarded change goes through (stock typed over, items deleted
 * in bulk). The server checks the PIN; this only collects it. */
export function ManagerPinBox({
  message,
  busy,
  onSubmit,
  onCancel,
  submitLabel = "Confirm",
}: {
  message: string;
  busy?: boolean;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [pin, setPin] = useState("");
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-warning bg-warning/10 p-3 text-xs text-foreground"
      onSubmit={(e) => {
        e.preventDefault();
        if (pin.trim()) onSubmit(pin.trim());
      }}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <Lock size={13} /> {message}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Manager PIN"
          aria-label="Manager PIN"
          className="w-32 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={busy || !pin.trim()} className="btn-primary-sm disabled:opacity-60">
          {busy ? "…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-muted underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
