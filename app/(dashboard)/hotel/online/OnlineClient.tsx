"use client";

import { useState, useTransition } from "react";
import Link from "@/lib/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Phone, RefreshCw, Trash2 } from "lucide-react";
import { addIcalFeedAction, declineRequestAction, removeIcalFeedAction, savePublicPageAction, syncIcalFeedsAction } from "@/lib/actions/hotel-ops";
import { formatStayDate } from "@/lib/hotel/dates";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

type Request = { id: string; status: string; guestName: string; guestPhone: string; rooms: number; roomTypeName: string; checkIn: string; checkOut: string; rate: number | null; message: string | null; bookingId: string | null; createdAt: string };
type Feed = { id: string; label: string; roomTypeName: string; syncedAt: string | null; error: string | null };

export function OnlineClient({ origin, page, requests, feeds, types, canManage }: { origin: string; page: { token: string; enabled: boolean; about: string; policies: string; contactPhone: string } | null; requests: Request[]; feeds: Feed[]; types: { id: string; name: string }[]; canManage: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(page?.enabled ?? false);
  const [about, setAbout] = useState(page?.about ?? "");
  const [policies, setPolicies] = useState(page?.policies ?? "");
  const [contactPhone, setContactPhone] = useState(page?.contactPhone ?? "");
  const [feedType, setFeedType] = useState(types[0]?.id ?? "");
  const [feedLabel, setFeedLabel] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const link = page ? `${origin}/stay/${page.token}` : null;
  const fresh = requests.filter((r) => r.status === "new");
  const older = requests.filter((r) => r.status !== "new").slice(0, 15);

  function run(action: () => Promise<{ error?: string }>, done: string, after?: () => void) {
    startTransition(async () => {
      const r = await action();
      if (r.error) return showToast(r.error, "error");
      showToast(done);
      after?.();
      router.refresh();
    });
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("Link copied"));
    } catch {
      window.prompt(t("Copy this link:"), text);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t("Booking requests")} {fresh.length > 0 && <span className="text-xs font-medium text-muted">({fresh.length})</span>}
        </h2>
        {fresh.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">{t("No new requests.")}</p>}
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
          {fresh.map((r) => (
            <li key={r.id} className="neu-card flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-foreground">{r.guestName}</p>
                  <p className="break-words text-xs text-muted">
                    {r.rooms} × {r.roomTypeName} · {formatStayDate(r.checkIn)} → {formatStayDate(r.checkOut)}
                    {r.rate ? ` · ${formatMoney(r.rate)} / ${t("night")}` : ""}
                  </p>
                </div>
                <a href={`tel:${r.guestPhone}`} aria-label={t("Call")} className="shrink-0 rounded-full border border-border p-2 text-foreground">
                  <Phone size={15} />
                </a>
              </div>
              {r.message && <p className="break-words text-xs text-foreground">{r.message}</p>}
              <div className="flex gap-2">
                <Link href={`/hotel/bookings/new?request=${r.id}`} className="flex-1 rounded-lg bg-brand px-3 py-2 text-center text-sm font-semibold text-white">
                  {t("Make the booking")}
                </Link>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(t("Decline this request?"))) run(() => declineRequestAction(r.id), t("Request declined"));
                  }}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60"
                >
                  {t("Decline")}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {older.length > 0 && (
          <details className="neu-card p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-foreground">{t("Earlier requests")}</summary>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {older.map((r) => (
                <li key={r.id} className="py-2 text-xs text-muted">
                  <span className="font-medium text-foreground">{r.guestName}</span> · {formatDateTime(r.createdAt)} · {r.status === "accepted" ? t("Booked") : t("Declined")}
                  {r.bookingId && (
                    <Link href={`/hotel/bookings/${r.bookingId}`} className="ml-1 font-semibold text-brand-text underline">
                      {t("Open booking")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("Your booking page")}</h2>
          <p className="text-xs text-muted">{t("Share this link on WhatsApp, Google or Instagram. Guests see your rooms and prices and send a request. No commission to anyone.")}</p>
        </div>
        {link && enabled && (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{link}</span>
            <button type="button" onClick={() => void copy(link)} aria-label={t("Copy")} className="rounded-full p-1 text-foreground">
              <Copy size={15} />
            </button>
            <a href={link} target="_blank" rel="noopener noreferrer" aria-label={t("Open")} className="rounded-full p-1 text-foreground">
              <ExternalLink size={15} />
            </a>
          </div>
        )}
        {canManage && (
          <>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              {t("Page is on")}
            </label>
            <label className={HOTEL_LABEL}>
              {t("Phone number for guests")}
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={HOTEL_INPUT} />
            </label>
            <label className={HOTEL_LABEL}>
              {t("About your hotel")}
              <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} className={HOTEL_INPUT} />
            </label>
            <label className={HOTEL_LABEL}>
              {t("Policies (check-in time, cancellation, ID)")}
              <textarea rows={3} value={policies} onChange={(e) => setPolicies(e.target.value)} className={HOTEL_INPUT} />
            </label>
            <button type="button" disabled={isPending} onClick={() => run(() => savePublicPageAction({ enabled, about, policies, contactPhone }), t("Saved"))} className="btn-primary disabled:opacity-60">
              {isPending ? t("Saving…") : t("Save")}
            </button>
          </>
        )}
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("Booking sites' calendars (iCal)")}</h2>
            <p className="text-xs text-muted">{t("For sites that give a calendar link, such as Airbnb. Dates they sell take a room here, and dates you are full can go back to them.")}</p>
          </div>
          {feeds.length > 0 && (
            <button type="button" disabled={isPending} onClick={() => run(syncIcalFeedsAction, t("Calendars read"))} aria-label={t("Read now")} className="shrink-0 rounded-full border border-border p-2 text-foreground disabled:opacity-60">
              <RefreshCw size={15} />
            </button>
          )}
        </div>
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">{t("A calendar isn't instant: each side reads the other every few hours, so a room can still be sold twice in between. It carries dates only, not guests or rates. Add those bookings by hand when they arrive.")}</p>

        {feeds.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {feeds.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0 text-xs">
                  <p className="break-words font-semibold text-foreground">
                    {f.label} · {f.roomTypeName}
                  </p>
                  {f.error ? <p className="text-danger">{t(f.error)}</p> : <p className="text-muted">{f.syncedAt ? `${t("Last read")} ${formatDateTime(f.syncedAt)}` : t("Not read yet")}</p>}
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={isPending}
                    aria-label={t("Remove")}
                    onClick={() => {
                      if (confirm(t("Remove this calendar? Its dates stop holding rooms."))) run(() => removeIcalFeedAction(f.id), t("Removed"));
                    }}
                    className="rounded-full p-1.5 text-muted hover:bg-surface-2"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && types.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold text-foreground">{t("Bring in a site's calendar")}</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={feedLabel} onChange={(e) => setFeedLabel(e.target.value)} placeholder={t("Site, e.g. Airbnb")} className={HOTEL_INPUT} />
              <select value={feedType} onChange={(e) => setFeedType(e.target.value)} className={HOTEL_INPUT}>
                {types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://…/calendar.ics" inputMode="url" className={HOTEL_INPUT} />
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(() => addIcalFeedAction({ roomTypeId: feedType, label: feedLabel, url: feedUrl }), t("Calendar added"), () => {
                  setFeedLabel("");
                  setFeedUrl("");
                })
              }
              className="btn-primary-sm self-start disabled:opacity-60"
            >
              {t("Add calendar")}
            </button>
          </div>
        )}

        {page && enabled && types.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground">{t("Give these links to the site")}</p>
            {types.map((x) => {
              const url = `${origin}/api/hotel/ical/${page.token}/${x.id}.ics`;
              return (
                <button key={x.id} type="button" onClick={() => void copy(url)} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-left text-xs text-foreground">
                  <span className="min-w-0 break-words">{x.name}</span>
                  <Copy size={14} className="shrink-0" />
                </button>
              );
            })}
          </div>
        )}
        {(!page || !enabled) && <p className="text-xs text-muted">{t("Turn your booking page on to get the links for sites.")}</p>}
      </section>
    </div>
  );
}
