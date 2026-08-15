"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { addStaffAction, removeStaffAction } from "@/lib/actions/staff";
import { useToast } from "@/app/components/Toast";
import { Popup } from "@/app/components/Popup";
import { EditStaffButton } from "./EditStaffButton";
import { PermissionsButton } from "./PermissionsButton";

type StaffMember = { id: string; name: string; role: "owner" | "manager" | "staff"; permissions: string[]; email: string | null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm"
    >
      {pending ? "Creating…" : "Create login"}
    </button>
  );
}

export function StaffClient({
  currentUserId,
  initialStaff,
}: {
  currentUserId: string;
  initialStaff: StaffMember[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await addStaffAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        showToast("Staff member added");
      }
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href="/more" className="text-sm text-muted">
        ← More
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Staff</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary-sm"
        >
          + Add staff
        </button>
      </div>

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title="Add staff">
        <form
          action={formAction}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              name="name"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Email (their login)</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Temporary password</span>
            <input
              name="password"
              type="text"
              required
              minLength={6}
              placeholder="Share this with them, at least 6 characters"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Role</span>
            <select
              name="role"
              defaultValue="staff"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          {state?.error && <p className="text-sm text-credit">{state.error}</p>}
          <SubmitButton />
        </form>
        </Popup>
      )}

      {removeError && <p className="rounded-lg bg-credit-soft px-3.5 py-2.5 text-sm text-credit">{removeError}</p>}

      <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
        {initialStaff.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-sm px-3.5 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
              <p className="text-xs text-muted capitalize">{s.role}</p>
            </div>
            <EditStaffButton staff={s} isSelf={s.id === currentUserId} />
            {s.role !== "owner" && <PermissionsButton staffId={s.id} staffName={s.name} initialPermissions={s.permissions} />}
            {s.id !== currentUserId && (
              <button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeStaffAction(s.id);
                    setRemoveError(result?.error ?? null);
                    if (!result?.error) showToast("Staff member removed", "info");
                  })
                }
                className="shrink-0 text-xs font-medium text-danger disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
