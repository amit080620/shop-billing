"use client";
import { Bell } from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import Link from "@/lib/link";
import { EmptyState } from "@/app/components/EmptyState";
import { PageHeader } from "@/app/components/PageHeader";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { Lang } from "@/lib/i18n/dictionary";
import { BackLink } from "@/app/components/BackLink";

export type ReminderTab = "udhaar" | "membership" | "appointments";
export type ReminderRow = {
  id: string;
  name: string;
  phone: string;
  href: string | null;
  detail: string;
  badge: { label: string; tone: "green" | "orange" | "red" };
  /** The WhatsApp text, already in the shop's language. */
  message: string;
};

const TAB_LABEL: Record<ReminderTab, string> = { udhaar: "Udhaar", membership: "Memberships", appointments: "Tomorrow's appointments" };

export function RemindersClient({
  tabs,
  tab,
  rows,
  summary,
  today,
  lang,
}: {
  tabs: ReminderTab[];
  tab: ReminderTab;
  rows: ReminderRow[];
  summary: { label: string; value: string } | null;
  today: string;
  lang: Lang;
}) {
  const { t } = useTranslation(lang);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  // "Sent" survives a reload for the rest of the day, so a long list can be worked through in sittings.
  const storeKey = `reminders-sent:${tab}:${today}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "[]") as string[];
      setSentIds(new Set(saved));
    } catch {
      setSentIds(new Set());
    }
  }, [storeKey]);
  function markSent(id: string) {
    setSentIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(storeKey, JSON.stringify([...next]));
      } catch {
        // private window: remembered for this visit only
      }
      return next;
    });
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const queue = useMemo(() => rows.filter((c) => selected.has(c.id) && !sentIds.has(c.id)), [rows, selected, sentIds]);
  const empty =
    tab === "udhaar"
      ? t("Nothing pending — every customer is settled up right now.")
      : tab === "membership"
        ? t("No membership ends this week.")
        : t("No appointments booked for tomorrow.");

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("WhatsApp reminders")}
        subtitle={t("Select people (or Select all), then work through the list — you still hit Send in WhatsApp yourself for each one.")}
        icon={<Bell size={17} strokeWidth={1.8} />}
      />

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((k) => (
            <Link key={k} href={`/reminders?tab=${k}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === k ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
              {t(TAB_LABEL[k])}
            </Link>
          ))}
        </div>
      )}

      {summary && (
        <div className={`rounded-xl border border-border p-4 ${tab === "udhaar" ? "bg-credit-soft" : "bg-brand-soft"}`}>
          <p className={`text-xs ${tab === "udhaar" ? "text-credit" : "text-brand-text"}`}>{summary.label}</p>
          <p className={`mt-1 text-xl font-semibold ${tab === "udhaar" ? "text-credit" : "text-brand-text"}`}>{summary.value}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState text={empty} />
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-border" />
            {t("Select all ({n})", { n: rows.length })}
          </label>

          {queue.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <p className="text-xs font-semibold text-brand-text">{t("Ready to send ({n})", { n: queue.length })}</p>
              <ul className="flex flex-col gap-1.5">
                {queue.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                    <a
                      href={buildWhatsAppLink(c.phone, c.message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSent(c.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      <WhatsAppIcon />
                      {t("Send")}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="flex flex-col gap-2">
            {rows.map((c) => {
              const sent = sentIds.has(c.id);
              const body = (
                <>
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <div className="flex items-center gap-1.5">
                    <p className={`truncate text-xs ${tab === "udhaar" ? "text-credit" : "text-muted"}`}>{c.detail}</p>
                    <Badge {...c.badge} />
                  </div>
                </>
              );
              return (
                <li key={c.id} className={`flex items-center justify-between gap-3 rounded-lg border border-border shadow-sm px-3.5 py-3 ${sent ? "bg-background opacity-60" : "bg-surface"}`}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} className="h-4 w-4 shrink-0 rounded border-border" aria-label={c.name} />
                  {c.href ? (
                    <Link href={c.href} className="min-w-0 flex-1">
                      {body}
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1">{body}</div>
                  )}
                  <a
                    href={buildWhatsAppLink(c.phone, c.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markSent(c.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white ${sent ? "bg-gray-400" : "bg-[#25D366]"}`}
                  >
                    <WhatsAppIcon />
                    {sent ? t("Sent") : t("Remind")}
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-center text-xs text-muted">
        {t("True automatic sending (no tap needed) requires WhatsApp's paid Business API — select who you need and work through them monthly, one tap each.")}
      </p>
    </div>
  );
}

function Badge({ label, tone }: ReminderRow["badge"]) {
  const styles: Record<string, { className: string; style?: React.CSSProperties }> = {
    green: { className: "text-white", style: { backgroundColor: "#16a34a" } },
    orange: { className: "text-white", style: { backgroundColor: "#c2760f" } },
    red: { className: "bg-danger/15 text-danger" },
  };
  const { className, style } = styles[tone];
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`} style={style}>
      {label}
    </span>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3C4 14.8 3.6 13.4 3.6 12c0-4.6 3.8-8.4 8.4-8.4s8.4 3.8 8.4 8.4-3.8 8.4-8.4 8.4zm4.6-6.3c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1 0-.3 0-.4C10.4 9.4 10 8.4 9.8 8c-.2-.4-.3-.3-.5-.3h-.4c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.4c.1.2 1.7 2.6 4.1 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
