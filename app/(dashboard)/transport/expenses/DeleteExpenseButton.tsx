"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTripExpenseAction } from "@/lib/actions/consignments";
import { useT } from "@/lib/i18n/LangContext";

export function DeleteExpenseButton({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("Remove")}
      onClick={() => {
        if (!window.confirm(t("Remove this expense?"))) return;
        start(async () => {
          const r = await deleteTripExpenseAction(id);
          if (r.error) window.alert(r.error);
          router.refresh();
        });
      }}
      className="shrink-0 px-1 text-xs text-danger disabled:opacity-50"
    >
      ✕
    </button>
  );
}
