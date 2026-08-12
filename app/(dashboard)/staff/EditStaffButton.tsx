"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updateStaffAction } from "@/lib/actions/staff";

type StaffMember = { id: string; name: string; role: "owner" | "manager" | "staff"; email: string | null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function EditStaffButton({ staff, isSelf }: { staff: StaffMember; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await updateStaffAction(staff.id, prev, formData);
      if (!result?.error) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    null,
  );

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-brand">
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form action={formAction} className="w-full max-w-sm rounded-2xl bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Edit staff member</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input name="name" defaultValue={staff.name} required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Role</span>
            <select
              name="role"
              defaultValue={staff.role}
              disabled={isSelf}
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
            {isSelf && <span className="text-xs text-muted">You can&apos;t change your own role.</span>}
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Reset password (optional)</span>
            {staff.email && (
              <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
                Login email: <span className="font-medium text-foreground">{staff.email}</span>
              </p>
            )}
            <input
              name="newPassword"
              type="text"
              minLength={6}
              placeholder="Leave blank to keep their current password"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
        {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
        <div className="mt-4 flex gap-2">
          <SubmitButton />
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
