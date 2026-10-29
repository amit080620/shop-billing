"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePermissionsAction } from "@/lib/actions/staff";
import { PERMISSIONS } from "@/lib/permissions";
import { ACCESS_V2, STAFF_AREAS } from "@/lib/staffAccess";

/** Things a staff member can do on a screen they already have (the screens themselves are areas). */
const ACTIONS = PERMISSIONS.filter((p) => !STAFF_AREAS.some((a) => a.key === p.key));

/** What a staff member may open and do. Billing is always theirs; every other screen and action is
 * the owner's to switch on, one by one. */
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
  // Made before areas existed: they can open every screen today, so all start ticked — saving never
  // quietly takes something away; the owner unticks what they shouldn't have.
  const legacy = !initialPermissions.includes(ACCESS_V2);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(legacy ? [...initialPermissions, ...STAFF_AREAS.map((a) => a.key)] : initialPermissions));
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
      const result = await savePermissionsAction(staffId, Array.from(selected).filter((k) => k !== ACCESS_V2));
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  const row = (key: string, label: string, description: string) => (
    <label key={key} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} className="mt-0.5 h-4 w-4 rounded border-border" />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-brand">
        Permissions
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">What can {staffName} do?</p>
            <p className="text-xs text-muted">
              Billing is always on. Tick each screen and action they should have — everything else stays closed to them, even by typing its
              address.
            </p>
            {legacy && (
              <p className="rounded-lg border border-credit bg-credit-soft px-3 py-2 text-xs text-credit">
                {staffName} was added before this list, so they can open every screen today. Everything is ticked below: untick what they
                shouldn&apos;t see, then save.
              </p>
            )}

            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Screens</p>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 opacity-80">
              <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 rounded border-border" />
              <span>
                <span className="block text-sm font-medium text-foreground">Billing</span>
                <span className="block text-xs text-muted">Make bills, print and share them, offline billing — always on</span>
              </span>
            </label>
            <div className="flex flex-col gap-2">{STAFF_AREAS.map((a) => row(a.key, a.label, a.description))}</div>

            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Actions</p>
            <div className="flex flex-col gap-2">{ACTIONS.map((p) => row(p.key, p.label, p.description))}</div>

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
