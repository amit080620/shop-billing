"use client";

import { useActionState, useState } from "react";
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

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.61 3.87M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

type Field = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  pleaseWaitLabel = "Please wait…",
}: {
  action: (prev: { error?: string } | null, formData: FormData) => Promise<{ error?: string } | null>;
  fields: Field[];
  submitLabel: string;
  pleaseWaitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{f.label}</span>
          {f.options ? (
            <select
              name={f.name}
              required
              defaultValue=""
              className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            >
              <option value="" disabled>
                {f.placeholder ?? "Choose one"}
              </option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : f.type === "password" ? (
            <div className="relative">
              <input
                name={f.name}
                type={visibleFields[f.name] ? "text" : "password"}
                placeholder={f.placeholder}
                required
                className="w-full rounded-xl border border-border bg-surface shadow-sm px-4 py-3 pr-11 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
              />
              <button
                type="button"
                onClick={() => setVisibleFields((prev) => ({ ...prev, [f.name]: !prev[f.name] }))}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted"
                aria-label={visibleFields[f.name] ? "Hide password" : "Show password"}
              >
                <EyeIcon open={!!visibleFields[f.name]} />
              </button>
            </div>
          ) : (
            <input
              name={f.name}
              type={f.type}
              placeholder={f.placeholder}
              required
              className="rounded-xl border border-border bg-surface shadow-sm px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            />
          )}
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
