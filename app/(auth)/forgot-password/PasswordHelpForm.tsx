"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import { requestPasswordHelpAction } from "@/lib/actions/auth";

type Words = { open: string; intro: string; email: string; phone: string; send: string; sending: string; sent: string };

function Send({ words }: { words: Words }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl border border-brand px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-60">
      {pending ? words.sending : words.send}
    </button>
  );
}

/** For when the reset email never arrives: ask The Ray's team to reset it and call back. */
export function PasswordHelpForm({ words }: { words: Words }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(requestPasswordHelpAction, null);

  if (state?.success) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-left text-sm text-success">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {words.sent}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand">
        <LifeBuoy size={15} /> {words.open}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border p-3 text-left">
      <p className="text-xs text-muted">{words.intro}</p>
      <input name="email" type="email" required placeholder={words.email} aria-label={words.email} className="neu-card px-4 py-3 text-base outline-none" />
      <input name="phone" type="tel" inputMode="numeric" required placeholder={words.phone} aria-label={words.phone} className="neu-card px-4 py-3 text-base outline-none" />
      {state?.error && <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">{state.error}</p>}
      <Send words={words} />
    </form>
  );
}
