"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBatchAction } from "@/lib/actions/pharmacy";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";

export function DeleteBatchButton({ batchId, productId, lang }: { batchId: string; productId: string; lang: Lang }) {
  const { t } = useTranslation(lang);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={() => {
          if (!confirm(t("batches.removeConfirm"))) return;
          startTransition(async () => {
            const result = await deleteBatchAction(batchId, productId);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setError(null);
            router.refresh();
          });
        }}
        disabled={isPending}
        className="shrink-0 text-xs text-danger disabled:opacity-60"
      >
        {t("batches.remove")}
      </button>
      {error && <p className="max-w-[160px] text-right text-[11px] text-credit">{error}</p>}
    </div>
  );
}
