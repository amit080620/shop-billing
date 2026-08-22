"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMedicineFromLibraryAction } from "@/lib/actions/clinic";

type Medicine = { id: string; medicineName: string; usageCount: number; lastUsedAt: string };

export function MedicineLibraryClient({ medicines: initial }: { medicines: Medicine[] }) {
  const [medicines, setMedicines] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  function remove(id: string) {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
    startTransition(async () => {
      await deleteMedicineFromLibraryAction(id);
    });
  }

  const visible = medicines.filter((m) => m.medicineName.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search saved medicines…"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <p className="text-xs text-muted">
        {medicines.length} medicine{medicines.length === 1 ? "" : "s"} saved
      </p>

      <ul className="flex flex-col gap-2">
        {visible.map((m) => (
          <li
            key={m.id}
            className="neu-card flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{m.medicineName}</p>
              <p className="text-xs text-muted">
                Used {m.usageCount} time{m.usageCount === 1 ? "" : "s"} · last on {new Date(m.lastUsedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <button
              onClick={() => remove(m.id)}
              disabled={isPending}
              className="shrink-0 rounded-lg p-2 text-danger disabled:opacity-50"
              aria-label={`Remove ${m.medicineName}`}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 && medicines.length > 0 && (
        <p className="py-6 text-center text-sm text-muted">No medicine matches &quot;{search}&quot;.</p>
      )}
    </div>
  );
}
