import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { MemberRow } from "./MemberRow";

type MembershipRow = {
  id: string;
  member_id: string;
  plan_name: string;
  end_date: string;
  status: "active" | "frozen" | "cancelled" | "expired";
  pt_sessions_total: number;
  pt_sessions_used: number;
};

export default async function GymMembersPage() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: members } = await admin
    .from("customers")
    .select("id, name, phone, assigned_trainer_id, staff:assigned_trainer_id ( name )")
    .eq("shop_id", session.shopId)
    .order("name");

  const memberIds = (members ?? []).map((m) => m.id);
  const { data: memberships } = memberIds.length
    ? await admin
        .from("memberships")
        .select("id, member_id, plan_name, end_date, status, pt_sessions_total, pt_sessions_used")
        .eq("shop_id", session.shopId)
        .in("member_id", memberIds)
        .order("end_date", { ascending: false })
    : { data: [] as MembershipRow[] };

  const latestMembershipByMember = new Map<string, MembershipRow>();
  for (const m of (memberships ?? []) as MembershipRow[]) {
    if (!latestMembershipByMember.has(m.member_id)) latestMembershipByMember.set(m.member_id, m);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Members"
        action={
          <Link href="/gym/members/new" className="btn-primary-sm">
            + Sell membership
          </Link>
        }
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
            <path d="M16 8 2 22M17.5 15H9" />
          </svg>
        }
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href="/gym/plans" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          📋 Plans
        </Link>
        <Link href="/gym/attendance" className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
          ✅ Attendance
        </Link>
      </div>

      {(!members || members.length === 0) ? (
        <EmptyState text="No members yet — sell your first membership to get started." />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const trainer = Array.isArray(m.staff) ? m.staff[0] : (m.staff as { name: string } | null);
            const membership = latestMembershipByMember.get(m.id);
            return (
              <MemberRow
                key={m.id}
                member={{
                  id: m.id,
                  name: m.name,
                  phone: m.phone,
                  trainerName: trainer?.name ?? null,
                  membership: membership
                    ? {
                        id: membership.id,
                        planName: membership.plan_name,
                        endDate: membership.end_date,
                        status: membership.status,
                        ptSessionsTotal: membership.pt_sessions_total,
                        ptSessionsUsed: membership.pt_sessions_used,
                      }
                    : null,
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
