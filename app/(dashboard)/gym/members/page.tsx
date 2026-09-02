import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { MemberRow } from "./MemberRow";
import { Users, User, ClipboardList, CheckCircle2, Filter } from "lucide-react";

type MembershipRow = {
  id: string;
  member_id: string;
  plan_name: string;
  end_date: string;
  status: "active" | "frozen" | "cancelled" | "expired";
  pt_sessions_total: number;
  pt_sessions_used: number;
};

export default async function GymMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const session = await requireSession();
  const { lang } = await getTranslator();
  const { mine } = await searchParams;
  const showMineOnly = mine === "1" && session.role !== "owner";
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("customers")
    .select("id, name, phone, assigned_trainer_id, staff:assigned_trainer_id ( name )")
    .eq("shop_id", session.shopId)
    .order("name")
    .limit(500);
  if (showMineOnly) query = query.eq("assigned_trainer_id", session.userId);
  const { data: members } = await query;

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
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Members"
        action={
          <Link href="/gym/members/new" className="btn-primary-sm">
            + Sell membership
          </Link>
        }
        icon={<Users size={18} strokeWidth={1.8} />}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {session.role !== "owner" && (
          <>
            <Link
              href="/gym/members"
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${!showMineOnly ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
              style={!showMineOnly ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
            >
              { }
              <Filter size={11} strokeWidth={2} /> All members
            </Link>
            <Link
              href="/gym/members?mine=1"
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${showMineOnly ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
              style={showMineOnly ? { boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" } : undefined}
            >
              <User size={12} /> My members
            </Link>
          </>
        )}
        <Link
          href="/gym/plans"
          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          <ClipboardList size={12} /> Plans
        </Link>
        <Link
          href="/gym/attendance"
          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          <CheckCircle2 size={12} /> Attendance
        </Link>
      </div>

      {showMineOnly && (!members || members.length === 0) ? (
        <EmptyState text="No members assigned to you yet." />
      ) : (!members || members.length === 0) ? (
        <EmptyState text="No members yet — sell your first membership to get started." />
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const trainer = Array.isArray(m.staff) ? m.staff[0] : (m.staff as { name: string } | null);
            const membership = latestMembershipByMember.get(m.id);
            return (
              <MemberRow
                key={m.id}
                lang={lang}
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
