"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { REORDER_HANDOFF_KEY, type ReorderHandoff } from "@/lib/reorderHandoff";

/** A new purchase from the same vendor with the same items and quantities, ready to correct and save. */
export function BuyAgainButton({ vendorId, items }: ReorderHandoff & { vendorId: string }) {
  const { t } = useT();
  const router = useRouter();
  if (!items.length) return null;
  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.setItem(REORDER_HANDOFF_KEY, JSON.stringify({ vendorId, items } satisfies ReorderHandoff));
        } catch {
          // A private window can't hand it over; the new purchase just opens empty.
        }
        router.push("/purchases/new");
      }}
      className="btn-primary-sm flex items-center gap-1.5"
    >
      <RefreshCw size={14} /> {t("Same purchase again")}
    </button>
  );
}
