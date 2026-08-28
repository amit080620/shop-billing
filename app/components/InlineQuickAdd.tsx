"use client";

import { useState, useTransition } from "react";
import { ContactPickerButton } from "./ContactPickerButton";

type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  /** If set, renders a <select> with these options instead of a text input. */
  options?: string[];
  defaultValue?: string;
};

export function InlineQuickAdd<T>({
  triggerLabel,
  fields,
  onSubmit,
  onCreated,
  contactFields,
  phoneAutofill,
}: {
  triggerLabel: string;
  fields: Field[];
  onSubmit: (values: Record<string, string>) => Promise<{ data?: T; error?: string }>;
  onCreated: (data: T) => void;
  /** When set, shows a "Pick from contacts" button (Android Chrome only —
   * hides itself elsewhere) that fills these two field names. */
  contactFields?: { name: string; phone: string };
  /** When set alongside contactFields, looks up the typed phone number
   * (debounced) and auto-fills the name field if that number is
   * already on file — never overwrites a name the person already
   * typed themselves. */
  phoneAutofill?: (phone: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePhoneChange(phone: string) {
    if (!phoneAutofill || !contactFields) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return;
    phoneAutofill(phone).then((name) => {
      if (!name) return;
      setValues((v) => (v[contactFields.name]?.trim() ? v : { ...v, [contactFields.name]: name }));
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        onCreated(result.data);
        setOpen(false);
        setValues({});
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm font-medium text-brand"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
      {contactFields && (
        <ContactPickerButton
          onPick={(name, phone) =>
            setValues((v) => ({ ...v, [contactFields.name]: name, [contactFields.phone]: phone }))
          }
        />
      )}
      {fields.map((f) =>
        f.options ? (
          <select
            key={f.name}
            value={values[f.name] ?? f.defaultValue ?? f.options[0]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            className="neu-card px-3 py-2 text-sm outline-none focus:border-brand"
          >
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            type={f.type ?? "text"}
            required={f.required}
            placeholder={f.placeholder ?? f.label}
            value={values[f.name] ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setValues((v) => ({ ...v, [f.name]: value }));
              if (f.name === contactFields?.phone) handlePhoneChange(value);
            }}
            className="neu-card px-3 py-2 text-sm outline-none focus:border-brand"
          />
        ),
      )}
      {error && <p className="text-xs text-credit">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add & use"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValues({});
            setError(null);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
