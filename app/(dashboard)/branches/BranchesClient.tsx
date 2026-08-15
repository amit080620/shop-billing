"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createBranchAction,
  updateBranchAction,
  toggleBranchActiveAction,
  deleteBranchAction,
  assignStaffBranchAction,
} from "@/lib/actions/branches";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";

type Branch = { id: string; name: string; address: string | null; isActive: boolean };
type Staff = { id: string; name: string; role: "owner" | "manager" | "staff"; branchId: string | null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Saving…" : "+ Add branch"}
    </button>
  );
}

export function BranchesClient({ branches, staff }: { branches: Branch[]; staff: Staff[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createBranchAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Branches"
        subtitle="Track which branch each sale and staff member belongs to — one account, multiple locations."
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + Branch
          </button>
        }
        icon={<Building2 size={18} strokeWidth={1.8} />}
      />
      <Link href="/more" className="text-sm text-muted">
        ← More
      </Link>

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title="Add branch">
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input name="name" placeholder="Branch name (e.g. MG Road)" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="address" placeholder="Address (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </form>
        </Popup>
      )}

      {branches.length === 0 ? (
        <EmptyState text="No branches yet — add your first one, or leave this empty if you only have one location." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {branches.map((b) =>
            editingId === b.id ? (
              <BranchEditRow key={b.id} branch={b} onDone={() => setEditingId(null)} />
            ) : (
              <li key={b.id} className="rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{b.name}</p>
                    {b.address && <p className="text-xs text-muted">{b.address}</p>}
                    {!b.isActive && <span className="mt-1 inline-block rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">Inactive</span>}
                  </div>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button onClick={() => setEditingId(b.id)} className="font-medium text-brand">
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await toggleBranchActiveAction(b.id, !b.isActive);
                          router.refresh();
                        })
                      }
                      disabled={isPending}
                      className="font-medium text-muted disabled:opacity-50"
                    >
                      {b.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete "${b.name}"? Past bills stay, just un-tagged.`)) return;
                        startTransition(async () => {
                          await deleteBranchAction(b.id);
                          router.refresh();
                        });
                      }}
                      disabled={isPending}
                      className="font-medium text-danger disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">Staff → branch assignment</p>
        <p className="text-xs text-muted">Whichever branch a staff member is assigned to, their bills get tagged with it automatically.</p>
        <ul className="flex flex-col gap-2">
          {staff
            .filter((s) => s.role !== "owner")
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-sm">
                <p className="text-sm text-foreground">{s.name}</p>
                <select
                  defaultValue={s.branchId ?? ""}
                  onChange={(e) =>
                    startTransition(async () => {
                      await assignStaffBranchAction(s.id, e.target.value || null);
                      router.refresh();
                    })
                  }
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand"
                >
                  <option value="">No branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function BranchEditRow({ branch, onDone }: { branch: Branch; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await updateBranchAction(branch.id, name, address);
              if (result.error) {
                setError(result.error);
                return;
              }
              router.refresh();
              onDone();
            })
          }
          disabled={isPending}
          className="btn-primary-sm disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </li>
  );
}
