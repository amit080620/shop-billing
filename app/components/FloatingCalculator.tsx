"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator as CalculatorIcon, X, Delete } from "lucide-react";
import { useCalculatorAmount } from "@/lib/calculatorAmount";
import { formatMoney } from "@/lib/format";

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function calc(a: number, b: number, op: string): number {
  switch (op) {
    case "+":
      return round(a + b);
    case "−":
      return round(a - b);
    case "×":
      return round(a * b);
    case "÷":
      return b === 0 ? 0 : round(a / b);
    default:
      return b;
  }
}

/** A genuinely floating, collapsible calculator — a small bubble that
 * expands into a full calculator on tap. Mounted once at the root, so
 * it's available on every screen (toggleable off in Preferences for
 * anyone who doesn't want it).
 *
 * The one thing that makes this more than a generic calculator: when
 * it's opened WHILE a billing screen has an active bill total (Sell,
 * Fast Billing...), that total is pre-loaded into the display —
 * genuinely useful for "customer's giving me a ₹500 note, how much
 * change" without retyping the bill amount. Opened with no active
 * bill, it just starts blank like any calculator.
 */
export function FloatingCalculator({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [prefilledFromBill, setPrefilledFromBill] = useState(false);
  const billAmount = useCalculatorAmount();
  const wasOpen = useRef(false);

  // The actual auto-fill moment: transitioning closed -> open picks up
  // whatever the active bill total is RIGHT NOW. Re-opening later
  // picks up the (possibly updated) total again, but doesn't fight
  // someone who's mid-calculation while it's already open.
  useEffect(() => {
    if (open && !wasOpen.current) {
      if (billAmount && billAmount > 0) {
        setDisplay(String(billAmount));
        setPrefilledFromBill(true);
      } else {
        setDisplay("0");
        setPrefilledFromBill(false);
      }
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(false);
    }
    wasOpen.current = open;
  }, [open, billAmount]);

  if (!enabled) return null;

  function inputDigit(d: string) {
    setPrefilledFromBill(false);
    if (waitingForOperand) {
      setDisplay(d);
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev === "0" ? d : prev.length < 14 ? prev + d : prev));
  }

  function inputDecimal() {
    setPrefilledFromBill(false);
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev.includes(".") ? prev : prev + "."));
  }

  function backspace() {
    setPrefilledFromBill(false);
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }

  function clearAll() {
    setDisplay("0");
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    setPrefilledFromBill(false);
  }

  function handlePercent() {
    setPrefilledFromBill(false);
    setDisplay(String(round(parseFloat(display) / 100)));
  }

  function performOperation(nextOperator: string) {
    setPrefilledFromBill(false);
    const inputValue = parseFloat(display);
    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operator && !waitingForOperand) {
      const result = calc(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(result);
    }
    setWaitingForOperand(true);
    setOperator(nextOperator);
  }

  function handleEquals() {
    setPrefilledFromBill(false);
    const inputValue = parseFloat(display);
    if (operator && previousValue !== null) {
      const result = calc(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open calculator"
        className="fixed bottom-24 right-4 z-40 flex items-center justify-center rounded-full bg-brand text-white md:bottom-6"
        style={{ width: 52, height: 52, boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}
      >
        <CalculatorIcon size={22} />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-24 right-4 z-40 flex w-[280px] flex-col overflow-hidden rounded-2xl bg-surface md:bottom-6"
      style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }}
    >
      <div className="flex items-center justify-between border-b border-border bg-brand px-3.5 py-2.5">
        <span className="text-sm font-semibold text-white">Calculator</span>
        <button onClick={() => setOpen(false)} aria-label="Close calculator" className="rounded-full p-1 text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 bg-background px-4 py-3">
        {prefilledFromBill && <span className="text-[10px] font-medium uppercase tracking-wide text-brand-text">From this bill</span>}
        <div className="truncate text-right font-mono text-3xl font-semibold text-foreground">{display}</div>
        {operator && previousValue !== null && (
          <div className="text-right text-xs text-muted">
            {formatMoney(previousValue)} {operator}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-px bg-border p-px">
        <CalcKey label="C" onClick={clearAll} variant="muted" />
        <CalcKey icon={<Delete size={16} />} onClick={backspace} variant="muted" />
        <CalcKey label="%" onClick={handlePercent} variant="muted" />
        <CalcKey label="÷" onClick={() => performOperation("÷")} variant="operator" active={operator === "÷"} />

        <CalcKey label="7" onClick={() => inputDigit("7")} />
        <CalcKey label="8" onClick={() => inputDigit("8")} />
        <CalcKey label="9" onClick={() => inputDigit("9")} />
        <CalcKey label="×" onClick={() => performOperation("×")} variant="operator" active={operator === "×"} />

        <CalcKey label="4" onClick={() => inputDigit("4")} />
        <CalcKey label="5" onClick={() => inputDigit("5")} />
        <CalcKey label="6" onClick={() => inputDigit("6")} />
        <CalcKey label="−" onClick={() => performOperation("−")} variant="operator" active={operator === "−"} />

        <CalcKey label="1" onClick={() => inputDigit("1")} />
        <CalcKey label="2" onClick={() => inputDigit("2")} />
        <CalcKey label="3" onClick={() => inputDigit("3")} />
        <CalcKey label="+" onClick={() => performOperation("+")} variant="operator" active={operator === "+"} />

        <CalcKey label="0" onClick={() => inputDigit("0")} wide />
        <CalcKey label="." onClick={inputDecimal} />
        <CalcKey label="=" onClick={handleEquals} variant="equals" />
      </div>
    </div>
  );
}

function CalcKey({
  label,
  icon,
  onClick,
  variant = "default",
  active = false,
  wide = false,
}: {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "muted" | "operator" | "equals";
  active?: boolean;
  wide?: boolean;
}) {
  const base = "flex h-14 items-center justify-center text-lg font-medium select-none";
  const styles =
    variant === "equals"
      ? "bg-brand text-white font-semibold"
      : variant === "operator"
        ? active
          ? "bg-brand-soft text-brand-text"
          : "bg-surface text-brand-text"
        : variant === "muted"
          ? "bg-surface text-muted text-sm font-semibold"
          : "bg-surface text-foreground";
  return (
    <button onClick={onClick} className={`${base} ${styles} ${wide ? "col-span-2" : ""}`}>
      {icon ?? label}
    </button>
  );
}
