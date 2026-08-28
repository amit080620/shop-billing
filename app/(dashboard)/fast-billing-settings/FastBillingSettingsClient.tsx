"use client";

import { useState } from "react";
import Link from "next/link";
import { toggleFastBillingAction } from "@/lib/actions/settings";

export function FastBillingSettingsClient({ enabled, productCount }: { enabled: boolean; productCount: number }) {
  const [isOn, setIsOn] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !isOn;
    setIsOn(next);
    setError(null);
    setIsSaving(true);
    const result = await toggleFastBillingAction(next);
    setIsSaving(false);
    if (result.error) {
      setIsOn(!next);
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="neu-card flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Fast Billing</p>
          <p className="text-xs text-muted">A tap-to-add product grid — built for quick counters (chai, snacks, quick food).</p>
        </div>
        <button
          onClick={toggle}
          disabled={isSaving}
          role="switch"
          aria-checked={isOn}
          className="relative h-8 w-14 shrink-0 rounded-full p-1"
          style={{
            boxShadow: "inset 4px 4px 8px var(--neu-dark), inset -4px -4px 8px var(--neu-light)",
          }}
        >
          <span
            className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full transition-transform ${isOn ? "translate-x-6 bg-brand" : "translate-x-0 bg-background"}`}
            style={{
              boxShadow: isOn
                ? "-2px -2px 5px rgba(255,255,255,0.35), 2px 2px 5px rgba(0,0,0,0.25)"
                : "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)",
            }}
          />
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {isOn && (
        <>
        <div className="neu-card flex flex-col gap-2 p-4">
          <p className="text-sm text-foreground">
            {productCount === 0 ? (
              <>No products are set up for Fast Billing yet.</>
            ) : (
              <>{productCount} product{productCount === 1 ? "" : "s"} showing in Fast Billing.</>
            )}
          </p>
          <Link href="/products" className="text-sm font-medium text-brand-text underline">
            {productCount === 0 ? "Choose which products to show →" : "Manage Fast Billing products →"}
          </Link>
        </div>

        {productCount > 0 && (
          <Link href="/fast-billing" className="btn-primary flex items-center justify-center">
            Open Fast Billing
          </Link>
        )}
        </>
      )}

      <p className="text-center text-xs text-muted">
        Fast Billing uses the exact same pricing, GST, discount, inventory and printing as normal billing — it&apos;s just a
        quicker way to reach them.
      </p>
    </div>
  );
}
