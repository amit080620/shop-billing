"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { archiveRoomAction, archiveRoomTypeAction, addRoomsAction, saveRoomTypeAction, updateRoomAction } from "@/lib/actions/hotel";
import { accommodationGstPercent } from "@/lib/hotel/gst";
import { formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/LangContext";
import { useToast } from "@/app/components/Toast";
import { Sheet } from "../Sheet";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

export type SetupType = { id: string; name: string; description: string | null; baseRate: number; maxAdults: number; maxChildren: number; amenities: string | null; gstPercent: number | null };
export type SetupRoom = { id: string; roomNumber: string; floor: string | null; roomTypeId: string };

export function SetupClient({ types, rooms, canEdit }: { types: SetupType[]; rooms: SetupRoom[]; canEdit: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [typeSheet, setTypeSheet] = useState<SetupType | "new" | null>(null);
  const [roomsSheet, setRoomsSheet] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<SetupRoom | null>(null);

  function run(action: () => Promise<{ error?: string }>, done?: string, after?: () => void) {
    startTransition(async () => {
      const r = await action();
      if (r.error) return showToast(r.error, "error");
      if (done) showToast(done);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t("Room types")}</h2>
          {canEdit && (
            <button type="button" onClick={() => setTypeSheet("new")} className="btn-primary-sm flex items-center gap-1">
              <Plus size={14} /> {t("Room type")}
            </button>
          )}
        </div>
        {types.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
            {t("Start with a room type — for example Deluxe AC at ₹3,000 a night. Then add the actual room numbers under it.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
            {types.map((ty) => {
              const mine = rooms.filter((r) => r.roomTypeId === ty.id);
              const gst = ty.gstPercent ?? accommodationGstPercent(ty.baseRate);
              return (
                <li key={ty.id} className="neu-card flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{ty.name}</p>
                      <p className="text-xs text-muted">
                        {formatMoney(ty.baseRate)} / {t("night")} · {ty.maxAdults} {ty.maxAdults === 1 ? t("adult") : t("adults")}
                        {ty.maxChildren > 0 && ` + ${ty.maxChildren} ${ty.maxChildren === 1 ? t("child") : t("children")}`}
                      </p>
                      <p className="text-xs text-muted">
                        {t("GST")} {gst}% {ty.gstPercent == null && <span>({t("standard slab")})</span>}
                      </p>
                      {ty.amenities && <p className="mt-0.5 truncate text-xs text-muted">{ty.amenities}</p>}
                    </div>
                    {canEdit && (
                      <button type="button" onClick={() => setTypeSheet(ty)} aria-label={t("Edit")} className="shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-2">
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {mine.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setEditRoom(r)}
                        className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-2 disabled:hover:bg-surface"
                      >
                        {r.roomNumber}
                      </button>
                    ))}
                    {mine.length === 0 && <span className="text-xs text-muted">{t("No rooms yet")}</span>}
                    {canEdit && (
                      <button type="button" onClick={() => setRoomsSheet(ty.id)} className="flex items-center gap-1 rounded-full border border-dashed border-brand px-2.5 py-1 text-xs font-medium text-brand-text">
                        <Plus size={12} /> {t("Add rooms")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
        <p className="font-semibold text-foreground">{t("How room tax works")}</p>
        <p className="mt-1">
          {t("GST on a room depends on its nightly rate before tax: up to ₹1,000 no GST, ₹1,001–₹7,500 5%, above ₹7,500 18%. It's added automatically. If your CA says a different rate applies, set it on the room type.")}
        </p>
        <p className="mt-1">{t("Every room also gets its own table in the Restaurant, so room service can be charged to the guest's bill.")}</p>
      </section>

      {typeSheet && (
        <TypeSheet
          initial={typeSheet === "new" ? null : typeSheet}
          pending={isPending}
          onClose={() => setTypeSheet(null)}
          onSave={(v) => run(() => saveRoomTypeAction(v), t("Saved"), () => setTypeSheet(null))}
          onRemove={
            typeSheet !== "new"
              ? () => {
                  if (window.confirm(t("Remove this room type?"))) run(() => archiveRoomTypeAction(typeSheet.id), t("Removed"), () => setTypeSheet(null));
                }
              : undefined
          }
        />
      )}
      {roomsSheet && (
        <AddRoomsSheet
          typeName={types.find((x) => x.id === roomsSheet)?.name ?? ""}
          pending={isPending}
          onClose={() => setRoomsSheet(null)}
          onAdd={(numbers, floor) =>
            startTransition(async () => {
              const r = await addRoomsAction({ roomTypeId: roomsSheet, numbers, floor });
              if (r.error) return showToast(r.error, "error");
              showToast(`${r.added} ${t("rooms added")}${r.skipped?.length ? ` · ${r.skipped.join(", ")} ${t("already existed")}` : ""}`);
              setRoomsSheet(null);
              router.refresh();
            })
          }
        />
      )}
      {editRoom && (
        <EditRoomSheet
          room={editRoom}
          types={types}
          pending={isPending}
          onClose={() => setEditRoom(null)}
          onSave={(v) => run(() => updateRoomAction({ id: editRoom.id, ...v }), t("Saved"), () => setEditRoom(null))}
          onRemove={() => {
            if (window.confirm(`${t("Remove room")} ${editRoom.roomNumber}?`)) run(() => archiveRoomAction(editRoom.id), t("Removed"), () => setEditRoom(null));
          }}
        />
      )}
    </div>
  );
}

function TypeSheet({
  initial,
  pending,
  onClose,
  onSave,
  onRemove,
}: {
  initial: SetupType | null;
  pending: boolean;
  onClose: () => void;
  onSave: (v: { id?: string; name: string; description?: string; baseRate: number; maxAdults: number; maxChildren: number; amenities?: string; gstPercent: number | null }) => void;
  onRemove?: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [rate, setRate] = useState(initial ? String(initial.baseRate) : "");
  const [adults, setAdults] = useState(String(initial?.maxAdults ?? 2));
  const [children, setChildren] = useState(String(initial?.maxChildren ?? 1));
  const [amenities, setAmenities] = useState(initial?.amenities ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [gst, setGst] = useState(initial?.gstPercent == null ? "" : String(initial.gstPercent));
  const slab = accommodationGstPercent(Number(rate) || 0);

  return (
    <Sheet title={initial ? t("Edit room type") : t("New room type")} onClose={onClose}>
      <label className={HOTEL_LABEL}>
        {t("Name")}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Deluxe AC")} className={HOTEL_INPUT} autoFocus />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Rate for one night (before tax, ₹)")}
        <input type="number" inputMode="decimal" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={HOTEL_LABEL}>
          {t("Adults per room")}
          <input type="number" inputMode="numeric" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} className={HOTEL_INPUT} />
        </label>
        <label className={HOTEL_LABEL}>
          {t("Children per room")}
          <input type="number" inputMode="numeric" min={0} value={children} onChange={(e) => setChildren(e.target.value)} className={HOTEL_INPUT} />
        </label>
      </div>
      <label className={HOTEL_LABEL}>
        {t("Amenities (optional)")}
        <input value={amenities} onChange={(e) => setAmenities(e.target.value)} placeholder={t("AC, TV, hot water, balcony")} className={HOTEL_INPUT} />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Notes (optional)")}
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <label className={HOTEL_LABEL}>
        {t("GST % override (leave empty for the standard slab)")}
        <input type="number" inputMode="decimal" min={0} value={gst} onChange={(e) => setGst(e.target.value)} placeholder={`${t("Standard")}: ${slab}%`} className={HOTEL_INPUT} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            onSave({
              id: initial?.id,
              name,
              description,
              baseRate: Number(rate),
              maxAdults: Number(adults),
              maxChildren: Number(children),
              amenities,
              gstPercent: gst.trim() === "" ? null : Number(gst),
            })
          }
          className="btn-primary flex-1 disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t("Remove")} className="rounded-lg border border-danger/30 px-3 text-danger hover:bg-danger-soft">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </Sheet>
  );
}

function AddRoomsSheet({ typeName, pending, onClose, onAdd }: { typeName: string; pending: boolean; onClose: () => void; onAdd: (numbers: string, floor: string) => void }) {
  const { t } = useT();
  const [numbers, setNumbers] = useState("");
  const [floor, setFloor] = useState("");
  return (
    <Sheet title={`${t("Add rooms")} · ${typeName}`} onClose={onClose}>
      <label className={HOTEL_LABEL}>
        {t("Room numbers")}
        <input value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="101-110, 201, 202" className={HOTEL_INPUT} autoFocus />
        <span className="font-normal">{t("Type a range like 101-110, or separate numbers with commas.")}</span>
      </label>
      <label className={HOTEL_LABEL}>
        {t("Floor (optional)")}
        <input value={floor} onChange={(e) => setFloor(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <button type="button" disabled={pending || !numbers.trim()} onClick={() => onAdd(numbers, floor)} className="btn-primary disabled:opacity-60">
        {pending ? t("Adding…") : t("Add rooms")}
      </button>
    </Sheet>
  );
}

function EditRoomSheet({
  room,
  types,
  pending,
  onClose,
  onSave,
  onRemove,
}: {
  room: SetupRoom;
  types: SetupType[];
  pending: boolean;
  onClose: () => void;
  onSave: (v: { roomNumber: string; floor: string; roomTypeId: string }) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [number, setNumber] = useState(room.roomNumber);
  const [floor, setFloor] = useState(room.floor ?? "");
  const [typeId, setTypeId] = useState(room.roomTypeId);
  return (
    <Sheet title={`${t("Room")} ${room.roomNumber}`} onClose={onClose}>
      <label className={HOTEL_LABEL}>
        {t("Room number")}
        <input value={number} onChange={(e) => setNumber(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <label className={HOTEL_LABEL}>
        {t("Room type")}
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={HOTEL_INPUT}>
          {types.map((ty) => (
            <option key={ty.id} value={ty.id}>
              {ty.name}
            </option>
          ))}
        </select>
      </label>
      <label className={HOTEL_LABEL}>
        {t("Floor (optional)")}
        <input value={floor} onChange={(e) => setFloor(e.target.value)} className={HOTEL_INPUT} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => onSave({ roomNumber: number, floor, roomTypeId: typeId })} className="btn-primary flex-1 disabled:opacity-60">
          {pending ? t("Saving…") : t("Save")}
        </button>
        <button type="button" onClick={onRemove} aria-label={t("Remove")} className="rounded-lg border border-danger/30 px-3 text-danger hover:bg-danger-soft">
          <Trash2 size={16} />
        </button>
      </div>
    </Sheet>
  );
}

