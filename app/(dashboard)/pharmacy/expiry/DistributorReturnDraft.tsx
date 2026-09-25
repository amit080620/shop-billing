"use client";

import { unitLabel } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { Undo2 } from "lucide-react";

type Row = { name: string; batchNumber: string; quantity: number; unit: string; expiryDate: string; daysLeft: number };
type VendorGroup = { vendorId: string; vendorName: string; vendorPhone: string | null; rows: Row[] };

/** The expiry list already says WHAT's expiring; this says WHO to send
 * it back to. Grouped by the vendor each product was most recently
 * bought from (inferred from purchase history, not a manual mapping
 * step), so a formal-looking return request goes straight to the
 * right distributor instead of a generic alert to whoever's picked
 * from the WhatsApp contact list. */
export function DistributorReturnDraft({ groups, shopName, lang }: { groups: VendorGroup[]; shopName: string; lang: Lang }) {
  const { t } = useTranslation(lang);

  function sendReturnRequest(group: VendorGroup) {
    if (!group.vendorPhone) return;
    const lines: string[] = [
      `*${t("returnDraft.heading", { shop: shopName })}*`,
      "",
      t("returnDraft.intro", { vendor: group.vendorName }),
      "",
      ...group.rows.map((r) => `• ${r.name} (${t("returnDraft.batch")} ${r.batchNumber}) — ${r.quantity} ${unitLabel(r.unit)}, ${r.daysLeft < 0 ? t("expiry.expired") : t("expiry.daysShort", { days: r.daysLeft })}`),
      "",
      t("returnDraft.closing"),
    ];
    window.open(buildWhatsAppLink(group.vendorPhone, lines.join("\n")), "_blank");
  }

  if (groups.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{t("returnDraft.title")}</p>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.vendorId} className="neu-card flex items-center gap-3 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Undo2 size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{group.vendorName}</p>
              <p className="text-xs text-muted">{t("returnDraft.itemCount", { n: group.rows.length })}</p>
            </div>
            {group.vendorPhone ? (
              <button
                onClick={() => sendReturnRequest(group)}
                className="shrink-0 rounded-lg border border-brand bg-brand-soft px-3 py-2 text-xs font-medium text-brand-text"
              >
                {t("returnDraft.send")}
              </button>
            ) : (
              <span className="shrink-0 text-xs text-muted">{t("returnDraft.noPhone")}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
