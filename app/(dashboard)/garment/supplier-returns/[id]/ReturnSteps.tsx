"use client";

import { useT } from "@/lib/i18n/LangContext";
import { cancelPurchaseReturnAction, postPurchaseReturnAction } from "@/lib/actions/garment";
import { ActionButton } from "../../ui";

export function ReturnSteps({ id }: { id: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton kind="primary" label={t("Post return")} confirm={t("The goods leave stock and the vendor's balance goes down. Post now?")} run={() => postPurchaseReturnAction(id)} />
      <ActionButton kind="danger" label={t("Cancel")} confirm={t("Cancel this draft return?")} run={() => cancelPurchaseReturnAction(id)} />
    </div>
  );
}
