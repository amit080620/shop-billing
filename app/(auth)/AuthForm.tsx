"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Eye,
  EyeOff,
  ShoppingCart,
  Store,
  Wrench,
  Pill,
  UtensilsCrossed,
  Repeat,
  Truck,
  Hammer,
  Scissors,
  Gem,
  Stethoscope,
  Dumbbell,
  FlaskConical,
  Building2,
  type LucideIcon,
} from "lucide-react";

// Mirrors businessType.ts's icon choices — kept as a lookup map here
// (rather than passing the component itself through props) because a
// Server Component can only pass plain, serializable data to a Client
// Component; a React component reference can't cross that boundary.
const BUSINESS_ICON_MAP: Record<string, LucideIcon> = {
  grocery: ShoppingCart,
  mart: Store,
  hardware: Wrench,
  pharmacy: Pill,
  restaurant: UtensilsCrossed,
  rental: Repeat,
  transport: Truck,
  service: Hammer,
  salon: Scissors,
  jewellery: Gem,
  clinic: Stethoscope,
  gym: Dumbbell,
  lab: FlaskConical,
  general: Building2,
};

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
  return open ? <Eye size={20} strokeWidth={1.8} /> : <EyeOff size={20} strokeWidth={1.8} />;
}

type Field = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  gridOptions?: { value: string; label: string; icon: string; colors: [string, string] }[];
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
  const [gridSelections, setGridSelections] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{f.label}</span>
          {f.gridOptions ? (
            <div className="grid grid-cols-3 gap-2.5">
              <input type="hidden" name={f.name} value={gridSelections[f.name] ?? ""} required />
              {f.gridOptions.map((opt) => {
                const selected = gridSelections[f.name] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGridSelections((prev) => ({ ...prev, [f.name]: opt.value }))}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-transform ${
                      selected ? "border-foreground scale-[1.05]" : "border-transparent"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${opt.colors[0]}, ${opt.colors[1]})`,
                      boxShadow: selected
                        ? "-5px -5px 12px var(--neu-light), 5px 5px 12px var(--neu-dark-strong)"
                        : "-4px -4px 10px var(--neu-light), 4px 4px 10px var(--neu-dark)",
                    }}
                  >
                    {(() => {
                      const Icon = BUSINESS_ICON_MAP[opt.icon];
                      return Icon ? (
                        <Icon size={22} className="text-white" style={{ filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.35))" }} strokeWidth={1.8} />
                      ) : null;
                    })()}
                    <span
                      className="text-[11px] font-semibold leading-tight text-white"
                      style={{ textShadow: "1px 1.5px 1px rgba(255,255,255,0.35), -1px -1px 1.5px rgba(0,0,0,0.4)" }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : f.options ? (
            <select
              name={f.name}
              required
              defaultValue=""
              className="neu-card px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
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
                className="w-full neu-card px-4 py-3 pr-11 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
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
              className="neu-card px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
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
