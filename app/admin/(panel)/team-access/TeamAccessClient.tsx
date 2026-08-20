"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  adminCreateTeamViewerAction,
  adminRemoveTeamViewerAction,
  adminResetTeamViewerPasswordAction,
} from "@/lib/actions/admin-team-access";

type Viewer = { userId: string; name: string; email: string | null; createdAt: string };

function CreateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60">
      {pending ? "Creating…" : "Create access"}
    </button>
  );
}

export function TeamAccessClient({ viewers }: { viewers: Viewer[] }) {
  const [createState, createAction] = useActionState(adminCreateTeamViewerAction, null);

  return (
    <div className="flex flex-col gap-4">
      <form action={createAction} className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-sm font-semibold text-white">Give someone view access</p>
        <input name="name" placeholder="Name" required className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500" />
        <input name="email" type="email" placeholder="Email" required className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500" />
        <input
          name="password"
          type="text"
          placeholder="Password (at least 8 characters)"
          required
          minLength={8}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
        />
        {createState?.error && <p className="text-xs text-red-400">{createState.error}</p>}
        <CreateSubmitButton />
      </form>

      <div className="flex flex-col gap-2">
        {viewers.length === 0 && <p className="text-sm text-gray-400">Nobody has view access yet.</p>}
        {viewers.map((v) => (
          <ViewerRow key={v.userId} viewer={v} />
        ))}
      </div>
    </div>
  );
}

function ViewerRow({ viewer }: { viewer: Viewer }) {
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{viewer.name}</p>
          {viewer.email && <p className="text-xs text-gray-300">{viewer.email}</p>}
        </div>
        <div className="flex shrink-0 gap-3">
          <button onClick={() => setShowReset((v) => !v)} className="text-[11px] font-medium text-blue-400">
            Reset password
          </button>
          <button
            onClick={() => {
              if (!confirm(`Remove ${viewer.name}'s access? This can't be undone.`)) return;
              startTransition(async () => {
                await adminRemoveTeamViewerAction(viewer.userId);
              });
            }}
            disabled={isPending}
            className="text-[11px] font-medium text-red-400 disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      </div>

      {showReset && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-gray-800 bg-gray-950 p-2">
          <p className="text-[11px] text-gray-300">New password for {viewer.name}</p>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
          />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {success && <p className="text-[11px] text-green-400">Password reset — share it with them directly.</p>}
          <div className="flex gap-1.5">
            <button
              onClick={() =>
                startTransition(async () => {
                  const result = await adminResetTeamViewerPasswordAction(viewer.userId, newPassword);
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
            <button onClick={() => setShowReset(false)} className="rounded border border-gray-700 px-2 py-1 text-[11px] text-gray-300">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
