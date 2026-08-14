"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { adminLoginAction } from "@/lib/actions/admin-auth";
import { Settings } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-white px-4 py-3.5 text-center font-semibold text-gray-900 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function AdminLoginPage() {
  const [state, formAction] = useActionState(adminLoginAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-900">
            <Settings size={22} />
          </div>
          <h1 className="text-xl font-bold text-white">Platform Admin</h1>
          <p className="mt-1 text-sm text-gray-400">Not a shop login — this manages the whole platform.</p>
        </div>

        <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-300">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-gray-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-gray-300">Password</span>
            <input
              name="password"
              type="password"
              required
              className="rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-gray-500"
            />
          </label>
          {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
