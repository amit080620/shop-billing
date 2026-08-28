"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type CalculatorAmountContextValue = {
  amount: number | null;
  setAmount: (n: number | null) => void;
};

const CalculatorAmountContext = createContext<CalculatorAmountContextValue | null>(null);

/** Mounted once at the root, alongside the floating calculator itself,
 * so any screen anywhere in the app can publish its live total into
 * it without prop-drilling through every layout in between. */
export function CalculatorAmountProvider({ children }: { children: ReactNode }) {
  const [amount, setAmount] = useState<number | null>(null);
  const value = useMemo(() => ({ amount, setAmount }), [amount]);
  return <CalculatorAmountContext.Provider value={value}>{children}</CalculatorAmountContext.Provider>;
}

function useCalculatorAmountContext(): CalculatorAmountContextValue {
  const ctx = useContext(CalculatorAmountContext);
  if (!ctx) {
    // Genuinely safe to no-op rather than throw — a screen that
    // forgets this provider (or renders before it mounts) should
    // still work as a normal billing page, just without the
    // calculator auto-fill.
    return { amount: null, setAmount: () => {} };
  }
  return ctx;
}

/** Call from any billing screen with its live total (subtotal/grand
 * total, whatever the person is actually about to collect). The
 * floating calculator picks this up automatically the moment it's
 * opened. Automatically clears itself on unmount/navigation so the
 * next screen doesn't inherit a stale amount from a bill you've left. */
export function useSyncCalculatorAmount(amount: number | null) {
  const { setAmount } = useCalculatorAmountContext();
  useEffect(() => {
    setAmount(amount && amount > 0 ? amount : null);
    return () => setAmount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);
}

/** Read-only access for the calculator itself. */
export function useCalculatorAmount(): number | null {
  return useCalculatorAmountContext().amount;
}
