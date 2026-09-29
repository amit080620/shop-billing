"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelQuotationAction } from "@/lib/actions/quotations";
import { useT } from "@/lib/i18n/LangContext";

export function CancelQuotationButton({ quotationId }: { quotationId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("Cancel this quotation?"))) return;
        start(async () => {
          await cancelQuotationAction(quotationId);
          router.refresh();
        });
      }}
      className="rounded-full border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
    >
      {t("Cancel quotation")}
    </button>
  );
}
