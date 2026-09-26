"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, ConciergeBell, FileText, LogIn, LogOut, MessageCircle, Pencil, Phone, Plus, Printer, Trash2, Wallet, X } from "lucide-react";
import { addChargeAction, assignRoomAction, changeStayDatesAction, checkInAction, removeChargeAction, setRoomRateAction, updateGuestAction } from "@/lib/actions/hotel";
import { startOrderAction } from "@/lib/actions/restaurant";
import { CHARGE_KINDS, ID_PROOF_TYPES, BOOKING_SOURCES, MEAL_PLANS, sourceIsOta, sourceTakesCommission, type MealPlan } from "@/lib/hotel/constants";
import { formatStayDate, formatStayDateLong, isIsoDate, addDays } from "@/lib/hotel/dates";
import type { BookingDetail } from "@/lib/hotel/server";
import { formatMoney, paymentMethodLabel } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL, SourceChip, StatusChip } from "../../ui";
import { CancelSheet, CheckOutSheet, PaymentSheet } from "./MoneySheets";
import { ErrorLine, useRun } from "./sheetUtils";

type FreeRoom = { id: string; roomNumber: string; dirty: boolean };
type SheetName = "checkin" | "charge" | "payment" | "dates" | "guest" | "checkout" | "cancel" | "roomservice";

export function BookingClient({
  booking: b,
  freeByBookingRoom,
  tableByRoom,
  shopName,
  canManage,
  canDiscount,
}: {
  booking: BookingDetail;
  freeByBookingRoom: Record<string, FreeRoom[]>;
  tableByRoom: Record<string, string>;
  shopName: string;
  canManage: boolean;
  canDiscount: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [rateFor, setRateFor] = useState<BookingDetail["rooms"][number] | null>(null);

  const open = b.status === "reserved" || b.status === "checked_in";
  const f = b.folio;
  const commission = b.commissionPercent > 0 ? Math.round(f.roomSubtotal * b.commissionPercent) / 100 : 0;

  function run(action: () => Promise<{ error?: string }>, done?: string) {
    startTransition(async () => {
      const r = await action();
      if (r.error) return showToast(r.error, "error");
      if (done) showToast(done);
      router.refresh();
    });
  }

  const roomLabel = (r: BookingDetail["rooms"][number]) => (r.roomNumber ? `${t("Room")} ${r.roomNumber}` : t("Room not assigned"));
  const whatsapp = b.guestPhone
    ? buildWhatsAppLink(
        b.guestPhone,
        [
          `Hello ${b.guestName}, your booking ${b.bookingNumber} at ${shopName} is confirmed.`,
          `Check-in: ${formatStayDateLong(b.checkIn)}`,
          `Check-out: ${formatStayDateLong(b.checkOut)} (${b.nights} night${b.nights === 1 ? "" : "s"})`,
          `Rooms: ${b.rooms.map((r) => r.roomTypeName).join(", ")}`,
          `Room charges: ${formatMoney(f.invoiceTotal)} (incl. GST)`,
          f.paid > 0 ? `Advance received: ${formatMoney(f.paid)}` : "",
          f.balance > 0 ? `Balance at check-in: ${formatMoney(f.balance)}` : "",
          "We look forward to hosting you!",
        ]
          .filter(Boolean)
          .join("\n"),
      )
    : null;

  function startRoomService(roomId: string) {
    const tableId = tableByRoom[roomId];
    if (!tableId) return showToast(t("This room has no restaurant table yet."), "error");
    startTransition(async () => {
      const r = await startOrderAction(tableId);
      if (r.error || !r.orderId) return showToast(r.error ?? t("Could not start the order"), "error");
      router.push(`/restaurant/orders/${r.orderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <section className="neu-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={b.status} t={t} />
          <SourceChip source={b.source} t={t} />
          {b.sourceRef && <span className="text-xs text-muted">#{b.sourceRef}</span>}
          {b.agentName && <span className="text-xs text-muted">· {b.agentName}</span>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{b.guestName}</p>
            <p className="text-xs text-muted">
              {b.adults} {b.adults === 1 ? t("adult") : t("adults")}
              {b.children > 0 && ` + ${b.children} ${b.children === 1 ? t("child") : t("children")}`} · {MEAL_PLANS.find((m) => m.value === b.mealPlan)?.short} · {b.nationality}
            </p>
            {b.guestPhone && <p className="text-xs text-muted">{b.guestPhone}</p>}
            {b.guestEmail && <p className="truncate text-xs text-muted">{b.guestEmail}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {b.guestPhone && (
              <a href={`tel:${b.guestPhone}`} aria-label={t("Call")} className="rounded-full border border-border p-2 text-foreground">
                <Phone size={15} />
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="rounded-full border border-border p-2 text-success">
                <MessageCircle size={15} />
              </a>
            )}
            {open && (
              <button type="button" onClick={() => setSheet("guest")} aria-label={t("Edit guest")} className="rounded-full border border-border p-2 text-foreground">
                <Pencil size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center">
          <div>
            <p className="text-[11px] text-muted">{t("Check-in")}</p>
            <p className="text-sm font-semibold text-foreground">{formatStayDate(b.checkIn)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t("Nights")}</p>
            <p className="text-sm font-semibold text-foreground">{b.nights}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t("Check-out")}</p>
            <p className="text-sm font-semibold text-foreground">{formatStayDate(b.checkOut)}</p>
          </div>
        </div>
        {open && (
          <button type="button" onClick={() => setSheet("dates")} className="self-start text-xs font-medium text-brand-text underline">
            {b.status === "checked_in" ? t("Extend or shorten the stay") : t("Change dates")}
          </button>
        )}
        {b.specialRequests && <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">“{b.specialRequests}”</p>}
        {b.idProofType && (
          <p className="text-xs text-muted">
            {t("ID")}: {b.idProofType} {b.idProofNumber}
          </p>
        )}
        {b.status === "cancelled" || b.status === "no_show" ? <p className="text-xs text-danger">{b.cancelReason || (b.status === "no_show" ? t("Did not arrive") : t("Cancelled"))}</p> : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("Rooms")}</h2>
        <ul className="flex flex-col gap-2">
          {b.rooms.map((r) => {
            const free = freeByBookingRoom[r.id] ?? [];
            return (
              <li key={r.id} className="neu-card flex flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {roomLabel(r)} · {r.roomTypeName}
                    </p>
                    <p className="text-xs text-muted">
                      {formatMoney(r.ratePerNight)} × {b.nights} {b.nights === 1 ? t("night") : t("nights")} · GST {r.gstPercent}% · {formatMoney(r.ratePerNight * b.nights)}
                    </p>
                  </div>
                  {open && (canManage || canDiscount) && (
                    <button type="button" onClick={() => setRateFor(r)} aria-label={t("Change rate")} className="shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-2">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {open && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <BedDouble size={14} className="shrink-0" />
                    <select
                      value={r.roomId ?? ""}
                      disabled={isPending}
                      onChange={(e) => run(() => assignRoomAction({ bookingRoomId: r.id, roomId: e.target.value || null }), t("Room updated"))}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-brand"
                    >
                      {b.status === "reserved" && <option value="">{t("Assign at check-in")}</option>}
                      {r.roomId && !free.some((x) => x.id === r.roomId) && <option value={r.roomId}>{`${t("Room")} ${r.roomNumber}`}</option>}
                      {free.map((x) => (
                        <option key={x.id} value={x.id}>
                          {`${t("Room")} ${x.roomNumber}${x.dirty ? ` · ${t("needs cleaning")}` : ""}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="neu-card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("Guest account")}</h2>
          {open && (
            <button type="button" onClick={() => setSheet("charge")} className="flex items-center gap-1 rounded-full border border-brand px-2.5 py-1 text-xs font-medium text-brand-text">
              <Plus size={12} /> {t("Add charge")}
            </button>
          )}
        </div>

        <Row label={`${t("Room charges")} (${b.nights} ${b.nights === 1 ? t("night") : t("nights")})`} value={formatMoney(f.roomSubtotal)} />
        {b.charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted">
              {c.description} <span className="text-[11px]">(+{c.gstPercent}% GST)</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-foreground">
              {formatMoney(c.amount)}
              {open && (
                <button type="button" disabled={isPending} onClick={() => run(() => removeChargeAction(c.id), t("Removed"))} aria-label={t("Remove")} className="text-muted hover:text-danger">
                  <X size={14} />
                </button>
              )}
            </span>
          </div>
        ))}
        {f.totals.discountAmount > 0 && <Row label={t("Discount")} value={`− ${formatMoney(f.totals.discountAmount)}`} />}
        <Row label={`${t("GST")} (CGST ${formatMoney(f.totals.cgstAmount)} + SGST ${formatMoney(f.totals.sgstAmount)})`} value={formatMoney(f.totals.gstAmount)} />
        {Math.abs(f.totals.roundOffAmount) > 0.001 && <Row label={t("Round off")} value={formatMoney(f.totals.roundOffAmount)} />}
        <Row label={t("Stay invoice")} value={formatMoney(f.invoiceTotal)} strong />

        {b.roomService.length > 0 && (
          <div className="mt-1 flex flex-col gap-1 border-t border-border pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Room service")}</p>
            {b.roomService.map((o) => (
              <Link key={o.id} href={`/restaurant/orders/${o.id}`} className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {t("Order")} #{o.orderNumber} {o.tableName ? `· ${o.tableName}` : ""}
                </span>
                <span className="text-foreground">{formatMoney(o.total)}</span>
              </Link>
            ))}
            <Row label={t("Room service total")} value={formatMoney(f.roomServiceTotal)} strong />
          </div>
        )}

        <div className="mt-1 flex flex-col gap-1 border-t border-border pt-2">
          <Row label={t("Total to pay")} value={formatMoney(f.grandTotal)} strong />
          {b.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-muted">
              <span>
                {p.kind === "refund" ? t("Refund") : p.kind === "advance" ? t("Advance") : t("Payment")} · {t(paymentMethodLabel(p.method))}
                {p.reference ? ` · ${p.reference}` : ""}
              </span>
              <span className={p.kind === "refund" ? "text-danger" : "text-success"}>
                {p.kind === "refund" ? "−" : "+"} {formatMoney(p.amount)}
              </span>
            </div>
          ))}
          <Row label={t("Received")} value={formatMoney(f.paid)} />
          {f.refundDue > 0 ? <Row label={t("Refund due to guest")} value={formatMoney(f.refundDue)} strong tone="danger" /> : <Row label={t("Balance due")} value={formatMoney(f.balance)} strong tone={f.balance > 0 ? "credit" : "success"} />}
        </div>

        {commission > 0 && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            {t("Commission to")} {b.agentName || t(BOOKING_SOURCES.find((s) => s.value === b.source)?.label ?? b.source)}: ~{formatMoney(commission)} ({b.commissionPercent}% {t("of room charges")})
          </p>
        )}
      </section>

      {b.status === "checked_out" && b.billId && (
        <Link href={`/print/bill/${b.billId}`} className="btn-primary flex items-center justify-center gap-2">
          <FileText size={16} /> {t("View GST invoice")}
        </Link>
      )}
      {b.status !== "cancelled" && b.status !== "no_show" && (
        <Link href={`/print/hotel/${b.id}`} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground">
          <Printer size={16} /> {t("Print guest folio")}
        </Link>
      )}
      {b.status === "cancelled" && b.billId && (
        <Link href={`/print/bill/${b.billId}`} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground">
          <FileText size={16} /> {t("View cancellation invoice")}
        </Link>
      )}

      {open && (
        <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,4rem)] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-72">
          <div className="mx-auto flex max-w-lg items-center gap-2 md:max-w-3xl">
            {b.status === "reserved" ? (
              <>
                <button type="button" onClick={() => setSheet("checkin")} className="btn-primary flex flex-1 items-center justify-center gap-2">
                  <LogIn size={16} /> {t("Check in")}
                </button>
                <button type="button" onClick={() => setSheet("payment")} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground">
                  <Wallet size={15} /> {t("Advance")}
                </button>
                {canManage && (
                  <button type="button" onClick={() => setSheet("cancel")} aria-label={t("Cancel booking")} className="rounded-lg border border-danger/30 px-3 py-2.5 text-danger hover:bg-danger-soft">
                    <Trash2 size={16} />
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => setSheet("checkout")} className="btn-primary flex flex-1 items-center justify-center gap-2">
                  <LogOut size={16} /> {t("Check out")}
                </button>
                <button type="button" onClick={() => setSheet("payment")} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground">
                  <Wallet size={15} /> {t("Payment")}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    const withTable = b.rooms.filter((r) => r.roomId && tableByRoom[r.roomId]);
                    if (withTable.length === 1) startRoomService(withTable[0].roomId as string);
                    else setSheet("roomservice");
                  }}
                  aria-label={t("Room service")}
                  className="rounded-lg border border-border px-3 py-2.5 text-foreground"
                >
                  <ConciergeBell size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {sheet === "checkin" && <CheckInSheet booking={b} free={freeByBookingRoom} onClose={() => setSheet(null)} />}
      {sheet === "charge" && <ChargeSheet bookingId={b.id} onClose={() => setSheet(null)} />}
      {sheet === "payment" && <PaymentSheet booking={b} canRefund={canManage} onClose={() => setSheet(null)} />}
      {sheet === "dates" && <DatesSheet booking={b} onClose={() => setSheet(null)} />}
      {sheet === "guest" && <GuestSheet booking={b} onClose={() => setSheet(null)} />}
      {sheet === "checkout" && <CheckOutSheet booking={b} canDiscount={canDiscount} onClose={() => setSheet(null)} />}
      {sheet === "cancel" && <CancelSheet booking={b} onClose={() => setSheet(null)} />}
      {sheet === "roomservice" && (
        <Sheet title={t("Room service — which room?")} onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-2">
            {b.rooms
              .filter((r) => r.roomId && tableByRoom[r.roomId])
              .map((r) => (
                <button key={r.id} type="button" onClick={() => startRoomService(r.roomId as string)} className="rounded-lg border border-border px-3 py-3 text-left text-sm font-medium text-foreground">
                  {roomLabel(r)} · {r.roomTypeName}
                </button>
              ))}
          </div>
        </Sheet>
      )}
      {rateFor && <RateSheet room={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "credit" | "success" }) {
  const color = tone === "danger" ? "text-danger" : tone === "credit" ? "text-credit" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={`shrink-0 ${strong ? "font-bold" : "font-medium"} ${color}`}>{value}</span>
    </div>
  );
}

function CheckInSheet({ booking: b, free, onClose }: { booking: BookingDetail; free: Record<string, FreeRoom[]>; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [idType, setIdType] = useState<string>(b.idProofType ?? "Aadhaar");
  const [idNumber, setIdNumber] = useState(b.idProofNumber ?? "");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [allowDirty, setAllowDirty] = useState(false);
  const unassigned = b.rooms.filter((r) => !r.roomId);
  const dirty = b.rooms.some((r) => r.housekeeping === "dirty") || unassigned.some((r) => (free[r.id] ?? []).find((x) => x.id === picked[r.id])?.dirty);

  return (
    <Sheet title={t("Check in")} onClose={onClose}>
      <p className="text-sm text-muted">
        {b.guestName} · {formatStayDate(b.checkIn)} → {formatStayDate(b.checkOut)}
      </p>
      {unassigned.map((r) => (
        <label key={r.id} className={HOTEL_LABEL}>
          {t("Room for")} {r.roomTypeName}
          <select value={picked[r.id] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))} className={HOTEL_INPUT}>
            <option value="">{t("Choose a room")}</option>
            {(free[r.id] ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {`${t("Room")} ${x.roomNumber}${x.dirty ? ` · ${t("needs cleaning")}` : ""}`}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("ID proof")}
          <select value={idType} onChange={(e) => setIdType(e.target.value)} className={HOTEL_INPUT}>
            {ID_PROOF_TYPES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className={HOTEL_LABEL}>
          {t("ID number")}
          <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      {dirty && (
        <label className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">
          <input type="checkbox" checked={allowDirty} onChange={(e) => setAllowDirty(e.target.checked)} className="mt-0.5" />
          {t("A room here hasn't been cleaned yet. Tick to check in anyway.")}
        </label>
      )}
      <ErrorLine error={error} />
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          run(
            () =>
              checkInAction({
                bookingId: b.id,
                idProofType: idType,
                idProofNumber: idNumber,
                allowDirty,
                assignments: Object.entries(picked)
                  .filter(([, roomId]) => roomId)
                  .map(([bookingRoomId, roomId]) => ({ bookingRoomId, roomId })),
              }),
            t("Checked in"),
          )
        }
        className="btn-primary disabled:opacity-60"
      >
        {isPending ? t("Checking in…") : t("Check in")}
      </button>
    </Sheet>
  );
}

const CHARGE_DEFAULT_GST: Record<string, number> = { extra_bed: 5, laundry: 18, minibar: 18, transport: 5, early_late: 5, misc: 18 };

function ChargeSheet({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [kind, setKind] = useState<string>("laundry");
  const [description, setDescription] = useState("Laundry");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18");

  return (
    <Sheet title={t("Add a charge to the room")} onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        {CHARGE_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value);
              setDescription(k.value === "misc" ? "" : t(k.label));
              setGst(String(CHARGE_DEFAULT_GST[k.value] ?? 18));
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${kind === k.value ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {t(k.label)}
          </button>
        ))}
      </div>
      <label className={HOTEL_LABEL}>
        {t("Description")}
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Amount before tax (₹)")}
          <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={HOTEL_INPUT} autoFocus />
        </label>
        <label className={HOTEL_LABEL}>
          {t("GST %")}
          <select value={gst} onChange={(e) => setGst(e.target.value)} className={HOTEL_INPUT}>
            {[0, 5, 12, 18, 28].map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine error={error} />
      <button type="button" disabled={isPending} onClick={() => run(() => addChargeAction({ bookingId, kind, description, amount: Number(amount), gstPercent: Number(gst) }), t("Charge added"))} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Add charge")}
      </button>
    </Sheet>
  );
}

function DatesSheet({ booking: b, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [checkIn, setCheckIn] = useState(b.checkIn);
  const [checkOut, setCheckOut] = useState(b.checkOut);
  const locked = b.status === "checked_in";
  return (
    <Sheet title={locked ? t("Extend or shorten the stay") : t("Change dates")} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Check-in")}
          <input type="date" value={checkIn} disabled={locked} onChange={(e) => setCheckIn(e.target.value)} className={`${HOTEL_INPUT} disabled:opacity-60`} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Check-out")}
          <input type="date" min={isIsoDate(checkIn) ? addDays(checkIn, 1) : undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      <p className="text-xs text-muted">{t("The room charges are recalculated for the new number of nights.")}</p>
      <ErrorLine error={error} />
      <button type="button" disabled={isPending} onClick={() => run(() => changeStayDatesAction({ bookingId: b.id, checkIn, checkOut }), t("Dates updated"))} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Save dates")}
      </button>
    </Sheet>
  );
}

function GuestSheet({ booking: b, onClose }: { booking: BookingDetail; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [name, setName] = useState(b.guestName);
  const [phone, setPhone] = useState(b.guestPhone ?? "");
  const [email, setEmail] = useState(b.guestEmail ?? "");
  const [nationality, setNationality] = useState(b.nationality);
  const [adults, setAdults] = useState(String(b.adults));
  const [children, setChildren] = useState(String(b.children));
  const [source, setSource] = useState(b.source);
  const [sourceRef, setSourceRef] = useState(b.sourceRef ?? "");
  const [agent, setAgent] = useState(b.agentName ?? "");
  const [commission, setCommission] = useState(b.commissionPercent ? String(b.commissionPercent) : "");
  const [meal, setMeal] = useState<MealPlan>(b.mealPlan as MealPlan);
  const [requests, setRequests] = useState(b.specialRequests ?? "");

  return (
    <Sheet title={t("Edit guest & booking")} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <label className={`${HOTEL_LABEL} col-span-2`}>
          {t("Guest name")}
          <input value={name} onChange={(e) => setName(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Mobile number")}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Email")}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Adults")}
          <input type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Children")}
          <input type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Nationality")}
          <input value={nationality} onChange={(e) => setNationality(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Meal plan")}
          <select value={meal} onChange={(e) => setMeal(e.target.value as MealPlan)} className={HOTEL_INPUT}>
            {MEAL_PLANS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.short} · {t(m.label)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${HOTEL_LABEL} col-span-2`}>
          {t("Booking source")}
          <select value={source} onChange={(e) => setSource(e.target.value)} className={HOTEL_INPUT}>
            {BOOKING_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.label)}
              </option>
            ))}
          </select>
        </label>
        {sourceIsOta(source) && (
          <label className={`${HOTEL_LABEL} col-span-2`}>
            {t("Booking ID from the app / website")}
            <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} className={HOTEL_INPUT} />
          </label>
        )}
        {source === "agent" && (
          <label className={`${HOTEL_LABEL} col-span-2`}>
            {t("Agent / broker name")}
            <input value={agent} onChange={(e) => setAgent(e.target.value)} className={HOTEL_INPUT} />
          </label>
        )}
        {sourceTakesCommission(source) && (
          <label className={`${HOTEL_LABEL} col-span-2`}>
            {t("Their commission (%)")}
            <input type="number" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} className={HOTEL_INPUT} />
          </label>
        )}
        <label className={`${HOTEL_LABEL} col-span-2`}>
          {t("Special requests")}
          <textarea rows={2} value={requests} onChange={(e) => setRequests(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      <ErrorLine error={error} />
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          run(
            () =>
              updateGuestAction({
                bookingId: b.id,
                guestName: name,
                guestPhone: phone,
                guestEmail: email,
                nationality,
                adults: Number(adults),
                children: Number(children),
                source,
                sourceRef,
                agentName: agent,
                commissionPercent: Number(commission) || 0,
                mealPlan: meal,
                specialRequests: requests,
              }),
            t("Saved"),
          )
        }
        className="btn-primary disabled:opacity-60"
      >
        {isPending ? t("Saving…") : t("Save")}
      </button>
    </Sheet>
  );
}

function RateSheet({ room, onClose }: { room: BookingDetail["rooms"][number]; onClose: () => void }) {
  const { t } = useT();
  const { run, isPending, error } = useRun(onClose);
  const [rate, setRate] = useState(String(room.ratePerNight));
  return (
    <Sheet title={`${t("Rate")} · ${room.roomNumber ? `${t("Room")} ${room.roomNumber}` : room.roomTypeName}`} onClose={onClose}>
      <label className={HOTEL_LABEL}>
        {t("Rate for one night, before tax (₹)")}
        <input type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={HOTEL_INPUT} autoFocus />
      </label>
      <p className="text-xs text-muted">{t("GST is worked out from this rate.")}</p>
      <ErrorLine error={error} />
      <button type="button" disabled={isPending} onClick={() => run(() => setRoomRateAction({ bookingRoomId: room.id, ratePerNight: Number(rate) }), t("Rate updated"))} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Save rate")}
      </button>
    </Sheet>
  );
}

