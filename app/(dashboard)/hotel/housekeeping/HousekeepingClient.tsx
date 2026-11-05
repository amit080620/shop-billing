"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRound, Wrench } from "lucide-react";
import { assignRoomsAction, createTicketAction, setHousekeepingAction, ticketStepAction } from "@/lib/actions/hotel-ops";
import { HK_LABEL, hkNext, TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL, type HkStage, type TicketCategory, type TicketPriority } from "@/lib/hotel/housekeeping";
import { formatStayDate } from "@/lib/hotel/dates";
import type { Ticket } from "@/lib/hotel/ops";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

export type HkCard = {
  id: string;
  roomNumber: string;
  floor: string | null;
  typeName: string;
  stage: string;
  blocked: boolean;
  blockReason: string | null;
  blockedUntil: string | null;
  assignedTo: string | null;
  guest: string | null;
  leavingToday: boolean;
  arrivingToday: boolean;
};

const STAGE_STYLE: Record<string, string> = { dirty: "bg-warning-soft text-warning", cleaning: "bg-info-soft text-info", clean: "bg-success-soft text-success", inspected: "bg-brand-soft text-brand-text" };
const STEP_LABEL: Record<HkStage, string> = { dirty: "Needs cleaning", cleaning: "Start cleaning", clean: "Mark clean", inspected: "Mark inspected" };
const PRIORITY_STYLE: Record<string, string> = { urgent: "bg-danger-soft text-danger", normal: "bg-surface-2 text-muted", low: "bg-surface-2 text-muted" };

type Filter = "todo" | "mine" | "ready" | "all";

export function HousekeepingClient({ rooms, tickets, staff, me, canManage, initialTab }: { rooms: HkCard[]; tickets: Ticket[]; staff: { id: string; name: string }[]; me: string; canManage: boolean; initialTab: "rooms" | "repairs" }) {
  const { t } = useT();
  const [tab, setTab] = useState(initialTab);
  const openTickets = tickets.filter((x) => x.status === "open" || x.status === "in_progress").length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTab("rooms")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "rooms" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("Rooms")}
        </button>
        <button type="button" onClick={() => setTab("repairs")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === "repairs" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("Repairs")} {openTickets > 0 && `(${openTickets})`}
        </button>
      </div>
      {tab === "rooms" ? <Rooms rooms={rooms} staff={staff} me={me} canManage={canManage} /> : <Repairs tickets={tickets} rooms={rooms} canManage={canManage} />}
    </div>
  );
}

function Rooms({ rooms: fromServer, staff, me, canManage }: { rooms: HkCard[]; staff: { id: string; name: string }[]; me: string; canManage: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("todo");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  // A tap shows at once, and the server's list replaces it when the refresh arrives.
  const [tapped, setTapped] = useState<Record<string, HkStage>>({});
  const saving = useRef(0);
  useEffect(() => setTapped({}), [fromServer]);
  const rooms = useMemo(() => fromServer.map((r) => (tapped[r.id] ? { ...r, stage: tapped[r.id] } : r)), [fromServer, tapped]);

  const toDo = (r: HkCard) => !r.blocked && (r.stage === "dirty" || r.stage === "cleaning");
  const counts = { todo: rooms.filter(toDo).length, mine: rooms.filter((r) => r.assignedTo === me && toDo(r)).length, ready: rooms.filter((r) => !r.blocked && !toDo(r)).length, all: rooms.length };
  const shown = rooms
    .filter((r) => (filter === "todo" ? toDo(r) : filter === "mine" ? r.assignedTo === me && toDo(r) : filter === "ready" ? !r.blocked && !toDo(r) : true))
    // A room with a guest arriving today comes first: it is the one the desk is waiting on.
    .sort((a, b) => Number(b.arrivingToday) - Number(a.arrivingToday));

  async function step(id: string, stage: HkStage) {
    setTapped((prev) => ({ ...prev, [id]: stage }));
    saving.current += 1;
    const r = await setHousekeepingAction(id, stage).catch(() => ({ error: t("Could not reach the server — try again.") }));
    saving.current -= 1;
    if (r.error) {
      setTapped((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(r.error, "error");
    }
    // Several rooms tapped in a row refresh once, after the last.
    if (saving.current === 0) router.refresh();
  }
  function assign(staffId: string) {
    startTransition(async () => {
      const r = await assignRoomsAction([...picked], staffId || null);
      if (r.error) return showToast(r.error, "error");
      setPicked(new Set());
      showToast(t("Rooms assigned"));
      router.refresh();
    });
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "todo", label: t("To clean") },
    { key: "mine", label: t("Mine") },
    { key: "ready", label: t("Ready") },
    { key: "all", label: t("All") },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(c.key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${filter === c.key ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {c.label} <span className="opacity-70">{counts[c.key]}</span>
          </button>
        ))}
      </div>

      {canManage && picked.size > 0 && (
        <label className={`${HOTEL_LABEL} rounded-xl border border-brand/40 bg-brand-soft p-3`}>
          {t("Give {n} room(s) to", { n: picked.size })}
          <select disabled={isPending} defaultValue="" onChange={(e) => assign(e.target.value)} className={HOTEL_INPUT}>
            <option value="" disabled>
              {t("Choose a person")}
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {shown.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No rooms here. All done!")}</p>}

      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {shown.map((r) => (
          <li key={r.id} className="neu-card flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {canManage && (
                  <input
                    type="checkbox"
                    aria-label={`${t("Room")} ${r.roomNumber}`}
                    checked={picked.has(r.id)}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                    className="mt-1.5 h-4 w-4 accent-[var(--brand)]"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight text-foreground">{r.roomNumber}</p>
                  <p className="truncate text-xs text-muted">
                    {r.typeName}
                    {r.floor ? ` · ${t("Floor")} ${r.floor}` : ""}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.blocked ? "bg-surface-2 text-muted" : STAGE_STYLE[r.stage] ?? STAGE_STYLE.dirty}`}>{r.blocked ? t("Out of service") : t(HK_LABEL[r.stage as HkStage] ?? r.stage)}</span>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {r.arrivingToday && <span className="font-semibold text-info">{t("Guest arriving today")}</span>}
              {r.guest && <span className={r.leavingToday ? "font-semibold text-credit" : ""}>{r.leavingToday ? t("Leaving today") : t("Guest in room")}</span>}
              {r.assignedTo && (
                <span className="flex items-center gap-1">
                  <UserRound size={11} /> {staffName.get(r.assignedTo) ?? ""}
                </span>
              )}
              {r.blocked && r.blockReason && <span>{r.blockReason}</span>}
              {r.blocked && r.blockedUntil && (
                <span>
                  {t("Back on")} {formatStayDate(r.blockedUntil)}
                </span>
              )}
            </div>

            {!r.blocked && (
              <div className="flex gap-2">
                {hkNext(r.stage).map((next, i) => (
                  <button key={next} type="button" onClick={() => void step(r.id, next)} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold ${i === 0 && next !== "dirty" ? "bg-brand text-white" : "border border-border text-foreground"}`}>
                    {t(STEP_LABEL[next])}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Repairs({ tickets, rooms, canManage }: { tickets: Ticket[]; rooms: HkCard[]; canManage: boolean }) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<Ticket | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const roomNumber = useMemo(() => new Map(rooms.map((r) => [r.id, r.roomNumber])), [rooms]);
  const open = tickets.filter((x) => x.status === "open" || x.status === "in_progress");
  const done = tickets.filter((x) => x.status === "done" || x.status === "cancelled");

  function start(id: string) {
    startTransition(async () => {
      const r = await ticketStepAction(id, "in_progress");
      if (r.error) return showToast(r.error, "error");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAdding(true)} className="btn-primary flex items-center justify-center gap-2">
        <Plus size={16} /> {t("Report a problem")}
      </button>
      {open.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("No repairs pending.")}</p>}
      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
        {open.map((x) => (
          <li key={x.id} className="neu-card flex flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-semibold text-foreground">
                {x.roomId ? `${t("Room")} ${roomNumber.get(x.roomId) ?? ""}: ` : ""}
                {x.title}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLE[x.priority]}`}>{t(TICKET_PRIORITY_LABEL[x.priority as TicketPriority] ?? x.priority)}</span>
            </div>
            <p className="break-words text-xs text-muted">
              {t(TICKET_CATEGORY_LABEL[x.category as TicketCategory] ?? x.category)} · {formatDateTime(x.createdAt)}
              {x.assignedTo ? ` · ${x.assignedTo}` : ""}
              {x.blocksRoom ? ` · ${t("Room is out of service")}` : ""}
            </p>
            {x.note && <p className="break-words text-xs text-foreground">{x.note}</p>}
            <div className="flex gap-2">
              {x.status === "open" && (
                <button type="button" disabled={isPending} onClick={() => start(x.id)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60">
                  {t("Start work")}
                </button>
              )}
              <button type="button" onClick={() => setClosing(x)} className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">
                {t("Done")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="neu-card p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-foreground">{t("Recently closed")}</summary>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {done.map((x) => (
              <li key={x.id} className="py-2 text-xs text-muted">
                <span className="font-medium text-foreground">
                  {x.roomId ? `${t("Room")} ${roomNumber.get(x.roomId) ?? ""}: ` : ""}
                  {x.title}
                </span>
                {x.resolution ? ` · ${x.resolution}` : ""}
                {x.cost ? ` · ${formatMoney(x.cost)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {adding && <TicketSheet rooms={rooms} canManage={canManage} onClose={() => setAdding(false)} />}
      {closing && <CloseSheet ticket={closing} onClose={() => setClosing(null)} />}
    </>
  );
}

function TicketSheet({ rooms, canManage, onClose }: { rooms: HkCard[]; canManage: boolean; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState<TicketCategory>("ac");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [blockRoom, setBlockRoom] = useState(false);
  const [backOn, setBackOn] = useState("");

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createTicketAction({ roomId: roomId || null, category, priority, title, note, assignedTo, blockRoom, backOn: backOn || null });
      if (r.error) return setError(r.error);
      showToast(t("Problem reported"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={t("Report a problem")} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Room")}
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={HOTEL_INPUT}>
            <option value="">{t("Not a room")}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomNumber}
              </option>
            ))}
          </select>
        </label>
        <label className={HOTEL_LABEL}>
          {t("Kind")}
          <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={HOTEL_INPUT}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(TICKET_CATEGORY_LABEL[c])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={HOTEL_LABEL}>
        {t("What is wrong?")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. AC not cooling")} className={HOTEL_INPUT} autoFocus />
      </label>
      <div className="flex gap-2">
        {TICKET_PRIORITIES.map((p) => (
          <button key={p} type="button" onClick={() => setPriority(p)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${priority === p ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
            {t(TICKET_PRIORITY_LABEL[p])}
          </button>
        ))}
      </div>
      <label className={HOTEL_LABEL}>
        {t("Who will fix it? (optional)")}
        <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder={t("e.g. Ramesh electrician")} className={HOTEL_INPUT} />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Note (optional)")}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={HOTEL_INPUT} />
      </label>
      {canManage && roomId && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={blockRoom} onChange={(e) => setBlockRoom(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            {t("Take this room out of service until it is fixed")}
          </label>
          {blockRoom && (
            <label className={HOTEL_LABEL}>
              {t("Expected back on (optional)")}
              <input type="date" value={backOn} onChange={(e) => setBackOn(e.target.value)} className={HOTEL_INPUT} />
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={save} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
        <Wrench size={16} /> {isPending ? t("Saving…") : t("Save")}
      </button>
    </Sheet>
  );
}

function CloseSheet({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [cost, setCost] = useState("");

  function finish(status: "done" | "cancelled") {
    setError(null);
    startTransition(async () => {
      const r = await ticketStepAction(ticket.id, status, resolution, cost === "" ? null : Number(cost));
      if (r.error) return setError(r.error);
      showToast(status === "done" ? t("Repair closed") : t("Ticket cancelled"));
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={ticket.title} onClose={onClose}>
      <label className={HOTEL_LABEL}>
        {t("What was done? (optional)")}
        <input value={resolution} onChange={(e) => setResolution(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Cost (₹, optional)")}
        <input type="number" inputMode="decimal" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={HOTEL_INPUT} />
      </label>
      {ticket.blocksRoom && <p className="text-xs text-muted">{t("The room comes back into service, marked for cleaning.")}</p>}
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={() => finish("done")} className="btn-primary disabled:opacity-60">
        {isPending ? t("Saving…") : t("Mark as fixed")}
      </button>
      <button type="button" disabled={isPending} onClick={() => finish("cancelled")} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted disabled:opacity-60">
        {t("Cancel this ticket")}
      </button>
    </Sheet>
  );
}
