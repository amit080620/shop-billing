import Link from "next/link";
import { MessageCircle, PlayCircle } from "lucide-react";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { plansMigrationApplied } from "@/lib/actions/admin-plans";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { srNumber, SUPPORT_PREFIX, supportParts } from "@/lib/support";
import { findVideos } from "@/lib/videoSearch";
import { PushToggle } from "../PushToggle";
import { SupportStatusButtons } from "./SupportStatusButtons";

const TABS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Working on it" },
  { key: "won", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

/** Support requests (SR-…) from Help → Contact us, in one inbox: who raised it, what's wrong, and a
 * WhatsApp reply that quotes the SR number. Its status is what the shop sees on its Help screen. */
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSuperAdmin();
  const { status = "new" } = await searchParams;
  if (!(await plansMigrationApplied())) {
    return <p className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4 text-sm text-amber-200">Support requests start collecting once migration 0040 has been run.</p>;
  }
  const db = createSupabaseAdminClient();
  let q = db
    .from("sales_enquiries")
    .select("id, item, status, created_at, shops ( id, name, owner_phone, business_type )")
    .eq("kind", "custom")
    .like("item", `${SUPPORT_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status as "new" | "contacted" | "won" | "lost");
  const [{ data }, { data: counts }] = await Promise.all([q, db.from("sales_enquiries").select("status").eq("kind", "custom").like("item", `${SUPPORT_PREFIX}%`)]);
  const n = (s: string) => (counts ?? []).filter((c) => s === "all" || c.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Support requests</h1>
        <Link href="/admin/enquiries" className="text-xs text-gray-400">
          Sales enquiries →
        </Link>
      </div>
      <PushToggle />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/support?status=${tab.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === tab.key ? "border-white bg-gray-800 text-white" : "border-gray-700 text-gray-400"}`}
          >
            {tab.label} · {n(tab.key)}
          </Link>
        ))}
      </div>

      {(data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-400">No support requests here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(data ?? []).map((r) => {
            const shop = (Array.isArray(r.shops) ? r.shops[0] : r.shops) as { id: string; name: string; owner_phone: string | null; business_type: string } | null;
            const { category, message } = supportParts(r.item);
            const sr = srNumber(r.id);
            const reply = shop?.owner_phone ? buildWhatsAppLink(shop.owner_phone, `Hi ${shop.name}, this is The Ray support about your request ${sr} ("${message.slice(0, 80)}"). `) : null;
            // The training video that most likely answers it, to send with the reply.
            const video = findVideos(message, shop?.business_type ?? "", 1)[0];
            const videoUrl = video ? `https://bill.theray.in/videos/${video.video.id}?t=${video.t}` : null;
            const videoReply = video && shop?.owner_phone ? buildWhatsAppLink(shop.owner_phone, `Hi ${shop.name}, this is The Ray support about your request ${sr}. This short video shows exactly how — "${video.topic}": ${videoUrl}`) : null;
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-100">
                      <span className="font-mono">{sr}</span> · {category}
                    </p>
                    <p className="text-xs text-gray-400">
                      {shop ? (
                        <Link href={`/admin/shops/${shop.id}`} className="underline">
                          {shop.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {shop?.business_type ? ` · ${shop.business_type}` : ""}
                      {shop?.owner_phone ? ` · ${shop.owner_phone}` : " · no phone"}
                      {" · "}
                      {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-200">{message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {reply && (
                    <a href={reply} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white">
                      <MessageCircle size={13} /> Reply on WhatsApp
                    </a>
                  )}
                  {videoReply && (
                    <a href={videoReply} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white">
                      <PlayCircle size={13} /> Reply with video
                    </a>
                  )}
                  <SupportStatusButtons id={r.id} status={r.status} />
                </div>
                {video && videoUrl && (
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">
                    Suggested video: {video.topic} — {video.video.title}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
