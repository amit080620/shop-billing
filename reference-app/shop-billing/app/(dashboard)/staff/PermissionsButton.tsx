"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePermissionsAction } from "@/lib/actions/staff";
import { PERMISSIONS } from "@/lib/permissions";

export function PermissionsButton({
  staffId,
  staffName,
  initialPermissions,
}: {
  staffId: string;
  staffName: string;
  initialPermissions: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialPermissions));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await savePermissionsAction(staffId, Array.from(selected));
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-brand">
        Permissions
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">What can {staffName} do?</p>
            <p className="text-xs text-muted">Tick everything they should have access to — everything else stays hidden/blocked for them.</p>

            <div className="flex flex-col gap-2">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{p.label}</span>
                    <span className="block text-xs text-muted">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={isPending} className="btn-primary-sm flex-1 disabled:opacity-60">
                {isPending ? "Saving…" : "Save permissions"}
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
