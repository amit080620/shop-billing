"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({ label, pleaseWaitLabel }: { label: string; pleaseWaitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl px-4 py-3.5 font-semibold text-white shadow-md disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
    >
      {pending ? pleaseWaitLabel : label}
    </button>
  );
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  pleaseWaitLabel = "Please wait…",
}: {
  action: (prev: { error?: string } | null, formData: FormData) => Promise<{ error?: string } | null>;
  fields: { name: string; label: string; type: string; placeholder?: string }[];
  submitLabel: string;
  pleaseWaitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{f.label}</span>
          <input
            name={f.name}
            type={f.type}
            placeholder={f.placeholder}
            required
            className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
          />
        </label>
      ))}
      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          {state.error}
        </p>
      )}
      <SubmitButton label={submitLabel} pleaseWaitLabel={pleaseWaitLabel} />
    </form>
  );
}
