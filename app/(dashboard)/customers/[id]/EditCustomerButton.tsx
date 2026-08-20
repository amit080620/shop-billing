"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/app/components/PhoneInput";
import { updateCustomerAction } from "@/lib/actions/customers";
import { INDIAN_STATES } from "@/lib/constants/states";

type Customer = { id: string; name: string; phone: string; gstin: string | null; address: string | null; stateCode: string | null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary flex-1 text-center disabled:opacity-60">
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function EditCustomerButton({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await updateCustomerAction(customer.id, prev, formData);
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
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand">
        Edit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <form action={formAction} className="w-full max-w-sm rounded-2xl bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Edit customer</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input name="name" defaultValue={customer.name} required className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Phone</span>
            <PhoneInput mode="form" name="phone" defaultValue={customer.phone} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">GSTIN (optional)</span>
            <input name="gstin" defaultValue={customer.gstin ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm uppercase outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Address (optional)</span>
            <input name="address" defaultValue={customer.address ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">State</span>
            <select name="stateCode" defaultValue={customer.stateCode ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">Not sure / skip</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
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
