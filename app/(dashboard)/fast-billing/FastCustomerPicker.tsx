"use client";

import { useEffect, useRef, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

export type CounterCustomer = { id: string; name: string; phone: string; loyaltyPoints: number };

const spaced = (phone: string) => (phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone);

/** Who the sale is for, typed at the counter. Typing the mobile number lists
 * matching customers as it grows; a full number already on file fills in the
 * customer by itself, and a new number moves on to its (optional) name.
 * Typing a name lists customers by name. Left empty, the bill is a plain
 * walk-in sale. While either box is in use the checkout shows only this
 * (onFocusMode), so the list fits above the keyboard. */
export function FastCustomerPicker({
  isUdhar,
  phone,
  name,
  matched,
  error,
  onPhoneChange,
  onNameChange,
  onPick,
  onFocusMode,
}: {
  isUdhar: boolean;
  phone: string;
  name: string;
  matched: CounterCustomer | null;
  error: string | null;
  onPhoneChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPick: (customer: CounterCustomer | null) => void;
  onFocusMode: (on: boolean) => void;
}) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [field, setField] = useState<"phone" | "name" | null>(null);
  const [found, setFound] = useState<{ query: string; customers: CounterCustomer[] }>({ query: "", customers: [] });
  const handled = useRef("");

  const query = matched ? "" : field === "phone" ? phone : field === "name" ? name.trim() : "";
  const searchable = field === "phone" ? query.length >= 3 : query.length >= 2;

  useEffect(() => {
    if (!searchable) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, { signal: abort.signal, cache: "no-store" });
        if (res.ok) setFound({ query, customers: (await res.json()) as CounterCustomer[] });
      } catch {
        // Typing moved on, or offline: no suggestions.
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, searchable]);

  const list = searchable && found.query === query ? found.customers : [];
  const fullNumber = !matched && phone.length === 10 && found.query === phone;
  const onFile = fullNumber ? (found.customers.find((c) => c.phone === phone) ?? null) : null;
  const isNew = fullNumber && !onFile;

  // A full number: the customer on file is picked by itself; a new one moves on to the name.
  useEffect(() => {
    if (!fullNumber || handled.current === phone) return;
    handled.current = phone;
    if (onFile) {
      onPick(onFile);
      phoneRef.current?.blur();
    } else {
      nameRef.current?.focus();
    }
  }, [fullNumber, onFile, phone, onPick]);

  function focusIn(which: "phone" | "name") {
    setField(which);
    onFocusMode(true);
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: "start" }));
  }

  function focusOut() {
    // Moving between the two boxes keeps focus mode; leaving both ends it.
    setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      setField(null);
      onFocusMode(false);
    }, 0);
  }

  function choose(customer: CounterCustomer) {
    handled.current = customer.phone;
    onPick(customer);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  const suggestions = list.length > 0 && (
    <ul className="max-h-[40dvh] overflow-y-auto rounded-lg border border-border bg-surface">
      {list.map((c) => (
        <li key={c.id} className="border-b border-border last:border-b-0">
          <button
            type="button"
            // Keeps the keyboard up until the choice is made.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(c)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{c.name}</span>
            <span className="shrink-0 text-xs text-muted">{spaced(c.phone)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const box = "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div ref={rootRef} className={`flex flex-col gap-2 rounded-lg border p-2.5 ${isUdhar ? "border-danger/25 bg-danger-soft" : "border-border"}`}>
      <p className={`text-[11px] ${isUdhar ? "text-danger" : "text-muted"}`}>
        {isUdhar ? t("Udhar needs a mobile number — it is who the money is collected from later.") : t("Customer (optional) — type a mobile number or name")}
      </p>

      {matched ? (
        <div className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2">
          <Check size={16} className="shrink-0 text-brand-text" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{matched.name}</p>
            <p className="text-xs text-muted">
              {spaced(matched.phone)}
              {matched.loyaltyPoints > 0 && ` · 🎁 ${matched.loyaltyPoints} ${t("points")}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              handled.current = "";
              onPick(null);
              onPhoneChange("");
              onNameChange("");
              requestAnimationFrame(() => phoneRef.current?.focus());
            }}
            aria-label={t("Change customer")}
            className="shrink-0 rounded-full p-1.5 text-muted"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <input
            ref={phoneRef}
            value={phone}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            onChange={(e) => onPhoneChange(e.target.value)}
            onFocus={() => focusIn("phone")}
            onBlur={focusOut}
            onKeyDown={(e) => e.key === "Enter" && nameRef.current?.focus()}
            placeholder={isUdhar ? t("Mobile number — required for udhar") : t("Mobile number (optional)")}
            className={box}
          />
          {field === "phone" && suggestions}
          {isNew && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-text">
              <UserPlus size={14} /> {t("New customer — add their name (optional)")}
            </p>
          )}
          <input
            ref={nameRef}
            value={name}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => onNameChange(e.target.value)}
            onFocus={() => focusIn("name")}
            onBlur={focusOut}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder={t("Customer name (optional)")}
            className={box}
          />
          {field === "name" && suggestions}
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
