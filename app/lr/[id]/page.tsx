import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { LangProvider } from "@/lib/i18n/LangContext";
import { messagesFor } from "@/lib/i18n/dictionary";
import { loadConsignment, loadLrShop, lrTotal, transportExtrasReady } from "@/lib/transportData";
import { LrDocument } from "@/lib/print/LrDocument";
import { DownloadImageButton } from "@/app/print/bill/[id]/DownloadImageButton";

export const metadata: Metadata = { title: "Consignment", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

// The consignment's tracking link, from the transporter's WhatsApp message: where the goods are,
// and the bilty itself. Read by the unguessable id, no login, read-only — like the invoice link.
// Phone numbers are left off, since the link can be forwarded.
export default async function TrackLrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const admin = createSupabaseAdminClient();
  if (!(await transportExtrasReady(admin))) notFound();
  const c = await loadConsignment(admin, id);
  if (!c) notFound();
  const shop = await loadLrShop(admin, c.shop_id);
  if (!shop) notFound();

  const steps = [
    { label: "Booked", done: true, at: new Date(`${c.lr_date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) },
    { label: "On the way", done: !!c.dispatched_at || c.status === "delivered", at: when(c.dispatched_at) },
    { label: c.received_by ? `Delivered — received by ${c.received_by}` : "Delivered", done: c.status === "delivered", at: when(c.delivered_at) },
  ];

  return (
    <LangProvider lang="en" messages={messagesFor("en")}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-3 bg-background px-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{shop.name}</p>
            <p className="text-xs text-muted">
              {c.lr_number} · {c.from_place} → {c.to_place}
            </p>
          </div>
          <div className="w-36 shrink-0">
            <DownloadImageButton invoiceNumber={c.lr_number} isThermal={false} />
          </div>
        </div>

        {c.status === "cancelled" ? (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">This consignment was cancelled by the transporter.</p>
        ) : (
          <ol className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-success text-white" : "border border-border text-muted"}`}>{s.done ? "✓" : ""}</span>
                <span className={s.done ? "font-medium text-foreground" : "text-muted"}>{s.label}</span>
                {s.done && s.at && <span className="ml-auto text-xs text-muted">{s.at}</span>}
              </li>
            ))}
            {c.pay_by === "to_pay" && !c.bill_id && c.status !== "delivered" && (
              <li className="rounded-lg bg-credit-soft px-3 py-2 text-xs text-credit">Freight to pay on delivery: ₹{lrTotal(c).toLocaleString("en-IN")}</li>
            )}
          </ol>
        )}

        <div className="rounded-xl border border-border bg-white">
          <div id="invoice-capture-area" className="bg-white text-black">
            <LrDocument c={c} shop={shop} hidePhones />
          </div>
        </div>
        <p className="text-center text-xs text-muted">Shared by {shop.name} using The Ray.</p>
      </div>
    </LangProvider>
  );
}
