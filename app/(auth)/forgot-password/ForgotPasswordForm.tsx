"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl px-4 py-3.5 font-semibold text-white shadow-md disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export function ForgotPasswordForm({
  action,
}: {
  action: (prev: { error?: string; success?: boolean } | null, formData: FormData) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [state, formAction] = useActionState(action, null);

  if (state?.success) {
    return (
      <div className="flex flex-col gap-3 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
          <Mail size={26} />
        </span>
        <p className="text-sm text-foreground">
          If an account exists with that email, a reset link is on its way. Check your inbox (and spam folder).
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
        />
      </label>
      {state?.error && <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
