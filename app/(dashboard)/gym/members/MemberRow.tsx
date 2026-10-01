"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Snowflake } from "lucide-react";
import { freezeMembershipAction, cancelMembershipAction, recordPtSessionAction, checkInMemberAction } from "@/lib/actions/gym";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type Membership = {
  id: string;
  planName: string;
  endDate: string;
  status: "active" | "frozen" | "cancelled" | "expired";
  ptSessionsTotal: number;
  ptSessionsUsed: number;
};
type Member = { id: string; name: string; phone: string; trainerName: string | null; membership: Membership | null };

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function MemberRow({ member, lang }: { member: Member; lang: Lang }) {
  const { t } = useTranslation(lang);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showFreeze, setShowFreeze] = useState(false);
  const [freezeDays, setFreezeDays] = useState(7);

  const m = member.membership;
  const days = m ? daysUntil(m.endDate) : null;
  const tone =
    !m || m.status !== "active" ? "default" : days !== null && days < 0 ? "expired" : days !== null && days <= 7 ? "soon" : "active";

  return (
    <li className="neu-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/gym/members/${member.id}`} className="text-sm font-semibold text-foreground underline-offset-2 hover:underline">
            {member.name}
          </Link>
          <p className="text-xs text-muted">
            {member.phone}
            {member.trainerName ? ` · ${t("Trainer: {name}", { name: member.trainerName })}` : ""}
          </p>
          {m && (
            <p className="text-xs text-muted">
              {m.planName}
              {m.ptSessionsTotal > 0 ? ` · ${t("PT {left}/{total} left", { left: m.ptSessionsTotal - m.ptSessionsUsed, total: m.ptSessionsTotal })}` : ""}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            tone === "active"
              ? "bg-green-100 text-green-700"
              : tone === "soon"
                ? "bg-credit-soft text-credit"
                : tone === "expired"
                  ? "bg-danger/15 text-danger"
                  : "bg-background text-muted"
          }`}
        >
          {!m
            ? t("No membership")
            : m.status === "frozen"
              ? t("Frozen")
              : m.status === "cancelled"
                ? t("Cancelled")
                : days !== null && days < 0
                  ? t("Expired {n}d ago", { n: Math.abs(days) })
                  : days !== null && days <= 7
                    ? t("Expires in {n}d", { n: days })
                    : t("Active")}
        </span>
      </div>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await checkInMemberAction(member.id);
              if (result.error) setError(result.error);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text disabled:opacity-60"
        >
          <CheckCircle2 size={13} className="mr-1 inline" /> {t("gym.checkIn")}
        </button>
        {m && m.status === "active" && (tone === "soon" || tone === "expired") && (
          <a
            href={buildWhatsAppLink(
              member.phone,
              t("wa.gymExpiryReminder", {
                name: member.name,
                plan: m.planName,
                date: new Date(m.endDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }),
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-credit bg-credit-soft px-2.5 py-1 text-xs font-medium text-credit"
          >
            <MessageCircle size={13} className="mr-1 inline" /> {t("Remind")}
          </a>
        )}
        {m && m.status === "active" && m.ptSessionsTotal > m.ptSessionsUsed && (
          <button
            onClick={() =>
              startTransition(async () => {
                const result = await recordPtSessionAction(m.id);
                if (result.error) setError(result.error);
                router.refresh();
              })
            }
            disabled={isPending}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60"
          >
            {t("Use PT session")}
          </button>
        )}
        {m && m.status === "active" && (
          <button onClick={() => setShowFreeze((v) => !v)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground">
            <Snowflake size={13} className="mr-1 inline" /> {t("Freeze")}
          </button>
        )}
        <Link href={`/gym/members/new?memberId=${member.id}&memberName=${encodeURIComponent(member.name)}&memberPhone=${encodeURIComponent(member.phone)}`} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-brand">
          {t("Renew")}
        </Link>
        {m && m.status === "active" && (
          <button
            onClick={() => {
              if (!confirm(t("Cancel this membership?"))) return;
              startTransition(async () => {
                const result = await cancelMembershipAction(m.id);
                if (result.error) setError(result.error);
                router.refresh();
              });
            }}
            disabled={isPending}
            className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger disabled:opacity-60"
          >
            {t("Cancel")}
          </button>
        )}
      </div>

      {showFreeze && m && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          <input
            type="number"
            min={1}
            value={freezeDays}
            onChange={(e) => setFreezeDays(Number(e.target.value) || 7)}
            className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
          />
          <span className="text-xs text-brand-text">{t("days")}</span>
          <button
            onClick={() =>
              startTransition(async () => {
                const result = await freezeMembershipAction(m.id, freezeDays);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setShowFreeze(false);
                router.refresh();
              })
            }
            disabled={isPending}
            className="btn-primary-sm disabled:opacity-60"
          >
            {t("Freeze")}
          </button>
        </div>
      )}
    </li>
  );
}
