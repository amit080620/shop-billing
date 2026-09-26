"use client";

import { useEffect, useState } from "react";
import { Download, Share2, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

/** Fetches the PNG from /api/shop-highlight once (it's generated fresh
 * per request, so a plain <img src> would re-trigger the server work
 * on every re-render) and offers it straight to the OS share sheet —
 * WhatsApp Status and Instagram Stories both take a shared image
 * directly, no separate "save then attach" step on a phone that
 * supports the Web Share API's file sharing. Falls back to a download
 * link on a browser that doesn't. */
export function ShopHighlightClient({ shopName }: { shopName: string }) {
  const { t } = useT();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch("/api/shop-highlight")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageBlob(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => setError(t("Couldn't create today's card — try again in a moment.")));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [t]);

  function download() {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shopName.replace(/\s+/g, "-")}-today.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    if (!imageBlob) return;
    const file = new File([imageBlob], "shop-highlight.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t("Today at {shop}", { shop: shopName }) });
      } catch {
        // person cancelled the share sheet — nothing to do
      }
    } else {
      download();
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl" style={{ aspectRatio: "9 / 16" }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={t("Today's shop highlight")} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-2">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        )}
      </div>

      {imageUrl && (
        <div className="mx-auto flex w-full max-w-xs gap-2">
          <button onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand px-3 py-2.5 text-sm font-medium text-brand-text">
            <Download size={16} /> {t("Download")}
          </button>
          <button onClick={share} className="btn-primary flex flex-1 items-center justify-center gap-2">
            <Share2 size={16} /> {t("Share")}
          </button>
        </div>
      )}
    </div>
  );
}
