"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
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

function SubmitButton({ label, pleaseWaitLabel, pending }: { label: string; pleaseWaitLabel: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary w-full disabled:opacity-60"
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
  requiredMessage?: string;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  pleaseWaitLabel = "Please wait…",
}: {
  action: (prev: { error?: string; redirectTo?: string } | null, formData: FormData) => Promise<{ error?: string; redirectTo?: string } | null>;
  fields: Field[];
  submitLabel: string;
  pleaseWaitLabel?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Success hands back a destination; go there with a full page load (see
  // ActionState in lib/actions/auth.ts for why not a client-side redirect).
  useEffect(() => {
    if (state?.redirectTo) window.location.replace(state.redirectTo);
  }, [state]);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [gridSelections, setGridSelections] = useState<Record<string, string>>({});
  // A hidden input can't be validated by the browser, so an unanswered
  // picker used to submit silently — and on signup that quietly locked
  // the shop into the wrong business type for good.
  const [missingGrid, setMissingGrid] = useState<string | null>(null);

  return (
    // Submitted via onSubmit rather than the form action prop: React 19
    // resets a form after every action — including one that returns an
    // error — which wiped the email, state and password the person had
    // just typed whenever login/signup failed.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const unanswered = fields.find((f) => f.gridOptions && !gridSelections[f.name]);
        if (unanswered) {
          setMissingGrid(unanswered.name);
          document.getElementById(`grid-${unanswered.name}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        setMissingGrid(null);
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4"
    >
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{f.label}</span>
          {f.gridOptions ? (
            <div
              id={`grid-${f.name}`}
              className={`grid grid-cols-3 gap-2.5 ${missingGrid === f.name ? "rounded-xl ring-1 ring-danger" : ""}`}
            >
              <input type="hidden" name={f.name} value={gridSelections[f.name] ?? ""} />
              {f.gridOptions.map((opt) => {
                const selected = gridSelections[f.name] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setGridSelections((prev) => ({ ...prev, [f.name]: opt.value }));
                      setMissingGrid(null);
                    }}
                    aria-pressed={selected}
                    className={`flex flex-col items-center gap-2 rounded-xl border bg-surface p-3 text-center transition-colors ${
                      selected ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-border hover:border-border-strong"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: `linear-gradient(135deg, ${opt.colors[0]}, ${opt.colors[1]})` }}
                    >
                      {(() => {
                        const Icon = BUSINESS_ICON_MAP[opt.icon];
                        return Icon ? <Icon size={18} className="text-white" strokeWidth={2} /> : null;
                      })()}
                    </span>
                    <span className={`text-[11px] font-semibold leading-tight ${selected ? "text-brand-text" : "text-foreground"}`}>{opt.label}</span>
                  </button>
                );
              })}
              {missingGrid === f.name && (
                <p className="col-span-3 text-xs font-medium text-danger">{f.requiredMessage ?? "Please choose one."}</p>
              )}
            </div>
          ) : f.options ? (
            <select
              name={f.name}
              required
              defaultValue=""
              className="px-3.5 py-3 text-base"
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
                className="w-full px-3.5 py-3 pr-11 text-base"
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
              className="px-3.5 py-3 text-base"
            />
          )}
        </label>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton label={submitLabel} pleaseWaitLabel={pleaseWaitLabel} pending={isPending || !!state?.redirectTo} />
    </form>
  );
}
