import Link from "@/lib/link";
import { IdCard } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { todayIso } from "@/lib/dateHelpers";
import { formatStayDate } from "@/lib/hotel/dates";
import { loadFormCGuests } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";

/** Foreign guests staying, due or recently gone, and whether each has been filed. */
export default async function FormCPage() {
  const gate = await hotelGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const guests = await loadFormCGuests(admin, session.shopId, todayIso());
  const toFile = guests.filter((g) => !g.filedAt && g.status !== "reserved");
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Form C")} subtitle={t("Foreign guests' details, to print and file")} icon={<IdCard size={18} strokeWidth={1.8} />} />
      <p className="rounded-xl border border-border bg-surface px-3.5 py-3 text-xs text-foreground">{t("Foreign guests must be reported on the government's FRRO portal within 24 hours of arrival. The Ray keeps the details ready to print or copy; the hotel files it on the portal and notes the reference here.")}</p>
      {toFile.length > 0 && <p className="rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-3 text-sm font-medium text-foreground">{t("{n} guest(s) not marked as filed", { n: toFile.length })}</p>}
      {guests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No foreign guests right now. A booking shows here when its guest's nationality isn't Indian.")}</p>
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
          {guests.map((g) => (
            <li key={g.id}>
              <Link href={`/hotel/form-c/${g.id}`} className="neu-card flex items-start justify-between gap-2 p-3 hover-lift">
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-foreground">{g.guestName}</span>
                  <span className="block break-words text-xs text-muted">
                    {g.nationality} · {formatStayDate(g.checkIn)} → {formatStayDate(g.checkOut)}
                    {g.passportNumber ? ` · ${g.passportNumber}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.filedAt ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{g.filedAt ? t("Filed") : t("Not filed")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
