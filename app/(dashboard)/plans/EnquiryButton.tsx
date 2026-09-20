"use client";

import { useState, useTransition } from "react";
import { Check, MessageCircle, Bell } from "lucide-react";
import { recordEnquiryAction } from "@/lib/actions/plans";
import { enquiryMessage, salesLink, type EnquiryKind } from "@/lib/sales";
import type { PlanKey } from "@/lib/plans";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";

/** One button for everything a shop can ask The Ray for. Plans, hardware
 * and services open WhatsApp with the message already written (shop name
 * and mobile included); "Notify me" only records interest. Either way the
 * enquiry is logged for the admin, best-effort. */
export function EnquiryButton({
  kind,
  item,
  label,
  shopName,
  ownerPhone,
  plan,
  variant = "primary",
  disabled = false,
}: {
  kind: EnquiryKind;
  item: string;
  label: string;
  shopName: string;
  ownerPhone: string | null;
  plan: PlanKey;
  variant?: "primary" | "outline" | "quiet";
  disabled?: boolean;
}) {
  const { t } = useT();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const notifyOnly = kind === "upcoming";

  function onClick() {
    if (!notifyOnly) {
      // Opened synchronously, inside the tap — a popup opened after an
      // await is blocked by phones' browsers.
      window.open(salesLink(enquiryMessage({ kind, item, shopName, ownerPhone, plan })), "_blank", "noopener");
    }
    startTransition(async () => {
      await recordEnquiryAction(kind, item);
      setDone(true);
      if (notifyOnly) showToast(t("Noted — we'll tell you when it's ready."));
    });
  }

  const styles =
    variant === "primary"
      ? "bg-brand text-white hover:opacity-90"
      : variant === "outline"
        ? "border border-brand/50 text-brand-text hover:bg-brand-soft"
        : "border border-border text-foreground hover:bg-surface-2";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || (notifyOnly && done)}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${styles}`}
    >
      {notifyOnly ? done ? <Check size={15} /> : <Bell size={15} /> : <MessageCircle size={15} />}
      {notifyOnly && done ? t("We'll notify you") : label}
    </button>
  );
}
