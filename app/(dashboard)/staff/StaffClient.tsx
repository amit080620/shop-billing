"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addStaffAction, removeStaffAction, restoreStaffAction } from "@/lib/actions/staff";
import { accessRemoved } from "@/lib/staffAccess";
import { useToast } from "@/app/components/Toast";
import { Popup } from "@/app/components/Popup";
import { EditStaffButton } from "./EditStaffButton";
import { PermissionsButton } from "./PermissionsButton";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";

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
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { showToast } = useToast();
  const [state, formAction] = useActionState(
    keepValuesOnError(async (prev: { error?: string } | null, formData: FormData) => {
      const result = await addStaffAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        showToast("Staff member added");
      }
      return result;
    }),
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">Staff</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary-sm"
        >
          {t("+ Add staff")}
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
        {initialStaff.filter((s) => !accessRemoved(s.permissions)).map((s) => (
          <li
            key={s.id}
            className={`neu-card flex items-center justify-between gap-3 px-3.5 py-3 ${deletingId === s.id ? "animate-delete" : ""}`}
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
                onClick={() => {
                  if (!window.confirm(`Remove ${s.name}? They won't be able to log in any more. Their bills, trips and records stay as they are, and you can give the access back later.`)) return;
                  setDeletingId(s.id);
                  startTransition(async () => {
                    const result = await removeStaffAction(s.id);
                    setRemoveError(result?.error ?? null);
                    if (!result?.error) showToast("Removed — they can't log in now", "info");
                  });
                }}
                className="shrink-0 text-xs font-medium text-danger disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {initialStaff.some((s) => accessRemoved(s.permissions)) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Removed — can&apos;t log in</h2>
          <p className="text-xs text-muted">Their bills, trips and records are kept under their name. Give the access back if they return.</p>
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
            {initialStaff
              .filter((s) => accessRemoved(s.permissions))
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-muted">{s.name}</p>
                    <p className="text-xs text-muted capitalize">
                      {s.role}
                      {s.email ? ` · ${s.email}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await restoreStaffAction(s.id);
                        setRemoveError(result?.error ?? null);
                        if (!result?.error) showToast(`${s.name} can log in again`);
                      })
                    }
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                  >
                    Give access back
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
