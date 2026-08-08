"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveCatalogSettingsAction } from "@/lib/actions/catalog";
import { PageHeader } from "@/app/components/PageHeader";

export function CatalogSettingsClient({
  isEnabled: initialEnabled,
  publicToken,
  bannerText: initialBanner,
}: {
  isEnabled: boolean;
  publicToken: string | null;
  bannerText: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [bannerText, setBannerText] = useState(initialBanner);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await saveCatalogSettingsAction({ isEnabled: enabled, bannerText });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(true);
      router.refresh();
    });
  }

  const publicUrl = publicToken && typeof window !== "undefined" ? `${window.location.origin}/shop/${publicToken}` : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Catalog link"
        subtitle="Share one link where anyone can browse your items with photos and order — no app, no login for them."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
          </svg>
        }
      />
      <Link href="/more" className="text-sm text-muted">
        ← More
      </Link>

      <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm">
        <span className="text-sm font-medium text-foreground">Enable public catalog link</span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 rounded border-border" />
      </label>

      {publicUrl && enabled && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <p className="text-xs font-medium text-brand-dark">Your catalog link — share this anywhere</p>
          <p className="break-all rounded-lg bg-surface px-3 py-2 text-xs text-foreground">{publicUrl}</p>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(publicUrl)}
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark"
            >
              Copy link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Browse & order from us: ${publicUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand px-3 py-1.5 text-xs font-medium text-brand-dark"
            >
              💬 Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Banner message (optional)</span>
        <input
          value={bannerText}
          onChange={(e) => setBannerText(e.target.value)}
          placeholder="e.g. Free delivery above ₹500!"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <p className="text-xs text-muted">
        Which items show up, and any offer price/badge on them, is controlled per-item in Products — look for &quot;Show this item in the public catalog&quot; on each item.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-brand">Saved.</p>}
      <button onClick={save} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Saving…" : "Save"}
      </button>

      <Link href="/catalog-orders" className="rounded-xl border border-border bg-surface px-4 py-3.5 text-center text-sm font-medium text-brand shadow-sm">
        📥 View incoming orders
      </Link>
    </div>
  );
}
