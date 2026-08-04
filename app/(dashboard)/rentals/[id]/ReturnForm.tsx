"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { returnRentalAction } from "@/lib/actions/rentals";

type Item = { id: string; name: string; quantity: number };
type Condition = "good" | "damaged" | "missing";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full text-center disabled:opacity-60">
      {pending ? "Saving…" : "Mark as returned"}
    </button>
  );
}

export function ReturnForm({ rentalId, items }: { rentalId: string; items: Item[] }) {
  const [conditions, setConditions] = useState<Record<string, Condition>>(
    Object.fromEntries(items.map((i) => [i.id, "good" as Condition])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [damageCharge, setDamageCharge] = useState<number | "">("");
  const [lateFee, setLateFee] = useState<number | "">("");

  const [state, formAction] = useActionState(returnRentalAction, null);

  const itemsPayload = JSON.stringify(
    items.map((i) => ({ rentalItemId: i.id, condition: conditions[i.id] ?? "good", damageNotes: notes[i.id] || undefined })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <p className="text-sm font-semibold text-brand-dark">Process return</p>
      <input type="hidden" name="rentalId" value={rentalId} />
      <input type="hidden" name="items" value={itemsPayload} />

      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5 rounded-lg bg-surface p-2.5">
          <p className="text-xs font-medium text-foreground">{item.name} × {item.quantity}</p>
          <div className="flex gap-1.5">
            {(["good", "damaged", "missing"] as Condition[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConditions((prev) => ({ ...prev, [item.id]: c }))}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                  conditions[item.id] === c ? "border-brand bg-brand-soft text-brand-dark" : "border-border text-muted"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {conditions[item.id] !== "good" && (
            <input
              value={notes[item.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
              placeholder="What happened? (optional)"
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs outline-none focus:border-brand"
            />
          )}
        </div>
      ))}

      <label className="flex flex-col gap-1 text-xs text-brand-dark">
        Damage charge (₹) — deducted from the deposit
        <input
          name="damageCharge"
          type="number"
          min={0}
          step="0.01"
          value={damageCharge}
          onChange={(e) => setDamageCharge(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-brand-dark">
        Late fee (₹) — if returned after the due date
        <input
          name="lateFee"
          type="number"
          min={0}
          step="0.01"
          value={lateFee}
          onChange={(e) => setLateFee(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
