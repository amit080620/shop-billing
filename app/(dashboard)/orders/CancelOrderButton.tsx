"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelQuotationAction } from "@/lib/actions/quotations";
import { useT } from "@/lib/i18n/LangContext";

export function CancelOrderButton({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("Cancel this order?"))) return;
        start(async () => {
          await cancelQuotationAction(id);
          router.refresh();
        });
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted disabled:opacity-60"
    >
      {t("Cancel")}
    </button>
  );
}
