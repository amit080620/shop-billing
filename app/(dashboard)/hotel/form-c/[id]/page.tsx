import { notFound } from "next/navigation";
import { IdCard } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { loose } from "@/lib/hotel/ops";
import { hotelGate } from "../../gate";
import { GuestDetailsClient } from "./GuestDetailsClient";

/** A guest's full details: address for every guest, passport and visa for a foreign one. */
export default async function GuestDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await hotelGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const { id } = await params;
  const { data: b } = await loose(admin).from("hotel_bookings").select("*").eq("id", id).eq("shop_id", session.shopId).maybeSingle();
  if (!b) notFound();
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback={`/hotel/bookings/${id}`} />
      <PageHeader title={b.guest_name} subtitle={t("Guest details and Form C")} icon={<IdCard size={18} strokeWidth={1.8} />} />
      <GuestDetailsClient
        bookingId={id}
        initial={{
          nationality: b.nationality ?? "",
          guestAddress: b.guest_address ?? "",
          gender: b.gender ?? "",
          dateOfBirth: b.date_of_birth ?? "",
          passportNumber: b.passport_number ?? "",
          passportIssuedAt: b.passport_issued_at ?? "",
          passportIssueDate: b.passport_issue_date ?? "",
          passportExpiry: b.passport_expiry ?? "",
          visaNumber: b.visa_number ?? "",
          visaType: b.visa_type ?? "",
          visaIssuedAt: b.visa_issued_at ?? "",
          visaIssueDate: b.visa_issue_date ?? "",
          visaExpiry: b.visa_expiry ?? "",
          arrivalInIndia: b.arrival_in_india ?? "",
          arrivedFrom: b.arrived_from ?? "",
          goingTo: b.going_to ?? "",
          visitPurpose: b.visit_purpose ?? "",
        }}
        filedAt={b.form_c_filed_at}
        reference={b.form_c_reference ?? ""}
      />
    </div>
  );
}
