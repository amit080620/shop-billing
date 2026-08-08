"use client";

import { useState, useTransition } from "react";
import { adminResetUserPasswordAction } from "@/lib/actions/admin-subscriptions";

export function AdminResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-medium text-blue-400">
        Reset password
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-lg border border-gray-800 bg-gray-950 p-2">
      <p className="text-[11px] text-gray-400">New password for {name}</p>
      <input
        type="text"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="At least 6 characters"
        className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {success && <p className="text-[11px] text-green-400">Password reset — share it with them directly.</p>}
      <div className="flex gap-1.5">
        <button
          onClick={() =>
            startTransition(async () => {
              const result = await adminResetUserPasswordAction(userId, newPassword);
              if (result.error) {
                setError(result.error);
                setSuccess(false);
                return;
              }
              setError(null);
              setSuccess(true);
              setNewPassword("");
            })
          }
          disabled={isPending}
          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-400">
          Close
        </button>
      </div>
    </div>
  );
}
