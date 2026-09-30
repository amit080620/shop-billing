"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { deleteRentalPhotoAction, uploadRentalPhotoAction } from "@/lib/actions/rentalPhotos";
import { useT } from "@/lib/i18n/LangContext";

type Photo = { url: string; stage: "out" | "in" | "id"; at: string; link: string | null };
const STAGES = [
  { key: "id", label: "Customer's ID" },
  { key: "out", label: "Item going out" },
  { key: "in", label: "Item back" },
] as const;

/** Photos kept with the rental: proof of the item's condition both ways, and the customer's ID. */
export function RentalPhotos({ rentalId, photos }: { rentalId: string; photos: Photo[] }) {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  function upload(stage: Photo["stage"], file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("image", file);
    start(async () => {
      setError(null);
      const r = await uploadRentalPhotoAction(rentalId, stage, fd);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className="neu-card flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-foreground">{t("Photos")}</p>
      <p className="text-xs text-muted">{t("Photo of the item as it goes and as it comes back — proof if there is damage. The ID photo stays private to your shop.")}</p>
      {STAGES.map((s) => {
        const list = photos.filter((p) => p.stage === s.key);
        return (
          <div key={s.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">{t(s.label)}</p>
              <button type="button" disabled={pending} onClick={() => inputs.current[s.key]?.click()} className="flex items-center gap-1 rounded-full border border-brand px-2.5 py-1 text-xs font-medium text-brand-text disabled:opacity-60">
                <Camera size={12} /> {pending ? t("Saving…") : t("Add photo")}
              </button>
              <input
                ref={(el) => {
                  inputs.current[s.key] = el;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                aria-label={t(s.label)}
                onChange={(e) => {
                  upload(s.key, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            {list.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {list.map((p) => (
                  <div key={p.url} className="relative">
                    {p.link ? (
                      <a href={p.link} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived private link */}
                        <img src={p.link} alt={t(s.label)} className="h-20 w-20 rounded-lg border border-border object-cover" />
                      </a>
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border text-[10px] text-muted">{t("Photo")}</div>
                    )}
                    <button
                      type="button"
                      aria-label={t("Remove")}
                      onClick={() =>
                        window.confirm(t("Remove this photo?")) &&
                        start(async () => {
                          const r = await deleteRentalPhotoAction(rentalId, p.url);
                          if (r.error) return setError(r.error);
                          router.refresh();
                        })
                      }
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-muted shadow"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
