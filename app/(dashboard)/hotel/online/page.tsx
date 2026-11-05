import { headers } from "next/headers";
import { Globe } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loadInventory } from "@/lib/hotel/server";
import { loose } from "@/lib/hotel/ops";
import { hotelGate } from "../gate";
import { OnlineClient } from "./OnlineClient";

/** The hotel's own booking link and its requests, and calendars shared with booking sites. */
export default async function OnlinePage() {
  const gate = await hotelGate("hotel_direct");
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t, canManage } = gate;
  const db = loose(admin);
  const [{ data: page }, { data: requests }, { data: feeds }, { types }, h] = await Promise.all([
    db.from("hotel_public_pages").select("token, is_enabled, about, policies, contact_phone").eq("shop_id", session.shopId).maybeSingle(),
    db.from("hotel_booking_requests").select("*").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(50),
    db.from("hotel_ical_feeds").select("id, room_type_id, label, last_synced_at, last_error").eq("shop_id", session.shopId).order("created_at"),
    loadInventory(admin, session.shopId),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const typeName = new Map(types.map((x) => [x.id, x.name]));
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/hotel" />
      <PageHeader title={t("Booking page & calendars")} subtitle={t("Your own booking link and booking sites' calendars")} icon={<Globe size={18} strokeWidth={1.8} />} />
      <OnlineClient
        origin={origin}
        page={page ? { token: page.token, enabled: page.is_enabled, about: page.about ?? "", policies: page.policies ?? "", contactPhone: page.contact_phone ?? "" } : null}
        requests={(requests ?? []).map((r) => ({ id: r.id, status: r.status, guestName: r.guest_name, guestPhone: r.guest_phone, rooms: r.rooms, roomTypeName: typeName.get(r.room_type_id) ?? "", checkIn: r.check_in_date, checkOut: r.check_out_date, rate: r.quoted_rate === null ? null : Number(r.quoted_rate), message: r.message, bookingId: r.booking_id, createdAt: r.created_at }))}
        feeds={(feeds ?? []).map((f) => ({ id: f.id, label: f.label, roomTypeName: typeName.get(f.room_type_id) ?? "", syncedAt: f.last_synced_at, error: f.last_error }))}
        types={types.map((x) => ({ id: x.id, name: x.name }))}
        canManage={canManage}
      />
    </div>
  );
}
