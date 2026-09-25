import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { plansMigrationApplied } from "@/lib/actions/admin-plans";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { UPCOMING } from "@/lib/sales";
import { EnquiryStatusButtons } from "./EnquiryStatusButtons";

const KIND_LABEL: Record<string, string> = {
  plan: "Plan upgrade",
  hardware: "Hardware",
  service: "Service",
  upcoming: "Notify me",
  custom: "Custom plan",
};

/** A support ticket from Help → Contact us is stored as kind "custom"
 * (see lib/actions/support.ts for why) with a "[Support/category]"
 * prefix on item — this is what tells the two apart here, and lets the
 * row show the same SR-xxxxxxxx reference number the shop saw. */
function parseSupportTicket(kind: string, item: string): { label: string; message: string } {
  const match = kind === "custom" ? item.match(/^\[Support\/(\w+)\]\s*([\s\S]*)$/) : null;
  if (!match) return { label: KIND_LABEL[kind] ?? kind, message: item };
  const [, category, message] = match;
  return { label: `Support · ${category}`, message };
}

export default async function AdminEnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSuperAdmin();
  const { status = "new" } = await searchParams;
  if (!(await plansMigrationApplied())) {
    return (
      <div className="flex flex-col gap-3">
        <Link href="/admin" className="text-xs text-gray-400">← All shops</Link>
        <p className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-sm text-amber-200">
          Enquiries start collecting once the database update (migration 0040) has been run. There&apos;s a copy button on the shops page.
        </p>
      </div>
    );
  }

  const db = createSupabaseAdminClient();
  let query = db
    .from("sales_enquiries")
    .select("id, kind, item, status, created_at, shops ( id, name, owner_phone )")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status as "new" | "contacted" | "won" | "lost");
  const { data } = await query;
  const rows = data ?? [];

  // "Notify me" interest, tallied — the roadmap follows this.
  const { data: interest } = await db.from("sales_enquiries").select("item").eq("kind", "upcoming");
  const tally = new Map<string, number>();
  for (const r of interest ?? []) tally.set(r.item, (tally.get(r.item) ?? 0) + 1);
  const wanted = UPCOMING.map((u) => ({ name: u.name, n: tally.get(u.name) ?? 0 })).sort((a, b) => b.n - a.n);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-xs text-gray-400">← All shops</Link>
      <h1 className="text-lg font-semibold">Enquiries</h1>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <p className="text-xs font-medium text-gray-300">What shops want next</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {wanted.map((w) => (
            <li key={w.name} className="flex items-center gap-2 text-xs text-gray-300">
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-800">
                <span className="block h-full bg-emerald-500" style={{ width: `${Math.min(100, (w.n / Math.max(1, wanted[0].n)) * 100)}%` }} />
              </span>
              <span className="w-6 text-right text-gray-400">{w.n}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-1.5 overflow-x-auto">
        {["new", "contacted", "won", "lost", "all"].map((s) => (
          <Link
            key={s}
            href={`/admin/enquiries?status=${s}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize ${status === s ? "border-white bg-gray-800 text-white" : "border-gray-700 text-gray-400"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const shop = Array.isArray(r.shops) ? r.shops[0] : r.shops;
          const ticket = parseSupportTicket(r.kind, r.item);
          const ticketId = ticket.label.startsWith("Support") ? `SR-${r.id.slice(0, 8).toUpperCase()}` : null;
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {ticketId && <p className="text-xs font-mono text-amber-400">{ticketId}</p>}
                  <p className="text-sm font-medium">{ticket.message}</p>
                  <p className="text-xs text-gray-400">
                    {ticket.label} ·{" "}
                    {shop ? (
                      <Link href={`/admin/shops/${shop.id}`} className="underline">{shop.name}</Link>
                    ) : (
                      "shop removed"
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-500">
                  {new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {shop?.owner_phone && (
                  <>
                    <a href={`tel:+91${shop.owner_phone}`} className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-100">Call {shop.owner_phone}</a>
                    <a
                      href={buildWhatsAppLink(shop.owner_phone, `Hi, this is The Ray. You asked about ${r.item} — `)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-emerald-700 px-2 py-1 text-xs text-white"
                    >
                      WhatsApp
                    </a>
                  </>
                )}
                <EnquiryStatusButtons id={r.id} status={r.status} />
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-400">Nothing here.</p>}
      </ul>
    </div>
  );
}
