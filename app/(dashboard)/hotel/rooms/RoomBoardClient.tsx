"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brush, CheckCircle2, ConciergeBell, Wrench } from "lucide-react";
import { setRoomStateAction } from "@/lib/actions/hotel";
import { startOrderAction } from "@/lib/actions/restaurant";
import { formatStayDate } from "@/lib/hotel/dates";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT } from "../ui";

export type BoardRoom = {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeName: string;
  tableId: string | null;
  state: "occupied" | "arriving" | "dirty" | "blocked" | "vacant";
  blockReason: string | null;
  guest: { bookingId: string; name: string; checkOut: string } | null;
  arrival: { bookingId: string; name: string } | null;
};

const STATE: Record<BoardRoom["state"], { label: string; tile: string; dot: string }> = {
  vacant: { label: "Vacant", tile: "border-success/40 bg-success-soft", dot: "bg-success" },
  occupied: { label: "Occupied", tile: "border-brand/40 bg-brand-soft", dot: "bg-brand" },
  arriving: { label: "Arriving today", tile: "border-info/40 bg-info-soft", dot: "bg-info" },
  dirty: { label: "Needs cleaning", tile: "border-warning/50 bg-warning-soft", dot: "bg-warning" },
  blocked: { label: "Out of service", tile: "border-border bg-surface-2", dot: "bg-muted" },
};

type Filter = "all" | BoardRoom["state"];

export function RoomBoardClient({ rooms, canManage }: { rooms: BoardRoom[]; canManage: boolean }) {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<BoardRoom | null>(null);

  const counts = rooms.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
  const shown = filter === "all" ? rooms : rooms.filter((r) => r.state === filter);
  const floors = [...new Set(shown.map((r) => r.floor ?? ""))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: t("All"), count: rooms.length },
    { key: "vacant", label: t("Vacant"), count: counts.vacant ?? 0 },
    { key: "occupied", label: t("Occupied"), count: counts.occupied ?? 0 },
    { key: "arriving", label: t("Arriving"), count: counts.arriving ?? 0 },
    { key: "dirty", label: t("Cleaning"), count: counts.dirty ?? 0 },
    { key: "blocked", label: t("Out of service"), count: counts.blocked ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === c.key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {c.label} <span className="opacity-70">{c.count}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No rooms match")}</p>}

      {floors.map((floor) => (
        <section key={floor || "none"} className="flex flex-col gap-2">
          {floors.length > 1 && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{floor ? `${t("Floor")} ${floor}` : t("Rooms")}</h2>}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5">
            {shown
              .filter((r) => (r.floor ?? "") === floor)
              .map((r) => {
                const s = STATE[r.state];
                return (
                  <li key={r.id} className="min-w-0">
                    <button type="button" onClick={() => setOpen(r)} className={`flex min-h-[92px] w-full flex-col items-start gap-0.5 rounded-xl border p-3 text-left ${s.tile}`}>
                      <span className="flex w-full items-center justify-between">
                        <span className="text-lg font-bold tracking-tight text-foreground">{r.roomNumber}</span>
                        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      </span>
                      <span className="max-w-full truncate text-[11px] text-muted">{r.roomTypeName}</span>
                      <span className="mt-auto max-w-full truncate text-xs font-medium text-foreground">
                        {r.state === "occupied" && r.guest ? r.guest.name : r.state === "arriving" && r.arrival ? r.arrival.name : t(s.label)}
                      </span>
                      {r.state === "occupied" && r.guest && <span className="text-[11px] text-muted">{t("till")} {formatStayDate(r.guest.checkOut)}</span>}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {open && <RoomSheet room={open} canManage={canManage} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RoomSheet({ room, canManage, onClose }: { room: BoardRoom; canManage: boolean; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [blocking, setBlocking] = useState(false);

  function set(patch: { housekeeping?: "clean" | "dirty"; blocked?: boolean; reason?: string }, done: string) {
    startTransition(async () => {
      const r = await setRoomStateAction({ roomId: room.id, ...patch });
      if (r.error) return showToast(r.error, "error");
      showToast(done);
      onClose();
      router.refresh();
    });
  }

  function roomService() {
    if (!room.tableId) return;
    startTransition(async () => {
      const r = await startOrderAction(room.tableId!);
      if (r.error || !r.orderId) return showToast(r.error ?? t("Could not start the order"), "error");
      router.push(`/restaurant/orders/${r.orderId}`);
    });
  }

  const s = STATE[room.state];
  return (
    <Sheet title={`${t("Room")} ${room.roomNumber} · ${room.roomTypeName}`} onClose={onClose}>
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} /> {t(s.label)}
        {room.state === "blocked" && room.blockReason ? ` — ${room.blockReason}` : ""}
      </p>

      {room.guest && (
        <Link href={`/hotel/bookings/${room.guest.bookingId}`} className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm">
          <p className="font-semibold text-foreground">{room.guest.name}</p>
          <p className="text-xs text-muted">{t("Check-out")} {formatStayDate(room.guest.checkOut)} · {t("Open booking")} →</p>
        </Link>
      )}
      {!room.guest && room.arrival && (
        <Link href={`/hotel/bookings/${room.arrival.bookingId}`} className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm">
          <p className="font-semibold text-foreground">{room.arrival.name}</p>
          <p className="text-xs text-muted">{t("Arriving today")} · {t("Open booking")} →</p>
        </Link>
      )}

      <div className="flex flex-col gap-2">
        {room.state === "dirty" && (
          <button type="button" disabled={isPending} onClick={() => set({ housekeeping: "clean" }, t("Marked clean"))} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
            <CheckCircle2 size={16} /> {t("Mark as clean")}
          </button>
        )}
        {(room.state === "vacant" || room.state === "arriving") && (
          <button type="button" disabled={isPending} onClick={() => set({ housekeeping: "dirty" }, t("Marked for cleaning"))} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground disabled:opacity-60">
            <Brush size={16} /> {t("Needs cleaning")}
          </button>
        )}
        {room.state === "occupied" && room.tableId && (
          <button type="button" disabled={isPending} onClick={roomService} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
            <ConciergeBell size={16} /> {t("Take a room-service order")}
          </button>
        )}
        {(room.state === "vacant" || room.state === "dirty") && (
          <Link href={`/hotel/bookings/new?room=${room.id}`} className="rounded-lg border border-border px-3 py-2.5 text-center text-sm font-medium text-foreground">
            {t("+ New booking for this room")}
          </Link>
        )}
        {canManage && room.state === "blocked" && (
          <button type="button" disabled={isPending} onClick={() => set({ blocked: false }, t("Back in service"))} className="btn-primary disabled:opacity-60">
            {t("Put back in service")}
          </button>
        )}
        {canManage && room.state !== "blocked" && room.state !== "occupied" && !blocking && (
          <button type="button" onClick={() => setBlocking(true)} className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted">
            <Wrench size={16} /> {t("Take out of service")}
          </button>
        )}
        {blocking && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Reason (e.g. AC repair)")} className={HOTEL_INPUT} autoFocus />
            <button type="button" disabled={isPending} onClick={() => set({ blocked: true, reason }, t("Taken out of service"))} className="btn-primary disabled:opacity-60">
              {t("Confirm")}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
