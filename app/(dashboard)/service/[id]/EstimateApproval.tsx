"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { askEstimateApprovalAction } from "@/lib/actions/estimate";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";

/** Asks the customer to approve the estimate on WhatsApp, and shows their answer. */
export function EstimateApproval({
  jobId,
  jobNumber,
  customerName,
  customerPhone,
  item,
  estimate,
  status,
  respondedAt,
  note,
  shopName,
}: {
  jobId: string;
  jobNumber: string;
  customerName: string;
  customerPhone: string;
  item: string;
  estimate: number;
  status: "sent" | "approved" | "declined" | null;
  respondedAt: string | null;
  note: string | null;
  shopName: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    // Opened right away (a phone blocks a window opened after a wait), then the job is marked.
    const link = `${window.location.origin}/job-status/${jobId}`;
    const text = t("Hi {name}, the repair of your {item} (job #{job}) will cost about {amount}. Please approve or decline here: {link} — {shop}", { name: customerName, item, job: jobNumber, amount: formatMoney(estimate), link, shop: shopName });
    window.open(buildWhatsAppLink(customerPhone, text), "_blank", "noopener");
    start(async () => {
      setError(null);
      const r = await askEstimateApprovalAction(jobId);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className={`flex flex-col gap-2 rounded-xl border p-3.5 ${status === "approved" ? "border-success bg-success-soft" : status === "declined" ? "border-danger bg-danger-soft" : "border-brand bg-brand-soft"}`}>
      {status === "approved" && (
        <p className="text-sm font-semibold text-success">
          {t("Customer approved the estimate")} {respondedAt ? `· ${formatDateTime(respondedAt)}` : ""}
        </p>
      )}
      {status === "declined" && (
        <p className="text-sm font-semibold text-danger">
          {t("Customer declined the estimate")} {respondedAt ? `· ${formatDateTime(respondedAt)}` : ""}
        </p>
      )}
      {status === "sent" && <p className="text-sm font-semibold text-brand-text">{t("Waiting for the customer's yes or no on the estimate")}</p>}
      {!status && <p className="text-sm text-brand-text">{t("Get the customer's OK before starting: they approve or decline {amount} from a link.", { amount: formatMoney(estimate) })}</p>}
      {note && <p className="text-xs text-foreground">“{note}”</p>}
      <button type="button" disabled={pending} onClick={ask} className="self-start rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
        {status ? t("Ask again on WhatsApp") : t("Ask for approval on WhatsApp")}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
