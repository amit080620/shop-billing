"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator as CalculatorIcon, X, Delete, ArrowLeftRight } from "lucide-react";
import { useCalculatorAmount } from "@/lib/calculatorAmount";
import { formatMoney } from "@/lib/format";

const POSITION_KEY = "ray-calc-position";
const BUBBLE_SIZE = 52;
const EXPANDED_WIDTH = 280;
const EXPANDED_HEIGHT = 420;
const IDLE_DIM_MS = 3500;

function getSize(isOpen: boolean): { w: number; h: number } {
  return isOpen ? { w: EXPANDED_WIDTH, h: EXPANDED_HEIGHT } : { w: BUBBLE_SIZE, h: BUBBLE_SIZE };
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A genuinely floating, draggable calculator — like iPhone's
 * AssistiveTouch: drag it anywhere on screen, it stays there (even
 * across app restarts), and dims itself out of the way after a few
 * seconds of not being touched so it never permanently blocks
 * content. Tap it any time to bring it back to full opacity and
 * open it. Mounted once at the root, so it's available on every
 * screen (toggleable off in Preferences).
 *
 * Opens in a dedicated "Change due" mode whenever a billing screen
 * has an active bill total — enter what the customer physically
 * handed over, and it shows the change to hand back as a plain
 * positive number, computed the correct direction every time (never
 * a confusing "-270" from subtracting in the wrong order). A "Calc"
 * toggle switches to a normal free-form calculator when that's what's
 * actually needed instead.
 */
export function FloatingCalculator({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"change" | "calc">("calc");
  const [display, setDisplay] = useState("0");
  const [receivedInput, setReceivedInput] = useState("");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const billAmount = useCalculatorAmount();
  const wasOpen = useRef(false);

  // ---------- Drag-to-reposition (AssistiveTouch-style) ----------
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ dragging: boolean; moved: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(POSITION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { x: number; y: number };
        setPos({
          x: clamp(parsed.x, 8, window.innerWidth - BUBBLE_SIZE - 8),
          y: clamp(parsed.y, 8, window.innerHeight - BUBBLE_SIZE - 8),
        });
        return;
      }
    } catch {
      // fall through to default position below
    }
    // The bottom-nav-clearance offset only makes sense on mobile —
    // this app's bottom nav is hidden at the md breakpoint (768px) on
    // desktop, so applying that same offset there was needless and
    // could push the bubble further than intended.
    const isMobile = window.innerWidth < 768;
    setPos({
      x: window.innerWidth - BUBBLE_SIZE - 16,
      y: window.innerHeight - BUBBLE_SIZE - (isMobile ? 112 : 24),
    });
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((current) => {
        if (!current) return current;
        const { w, h } = getSize(open);
        return {
          x: clamp(current.x, 8, window.innerWidth - w - 8),
          y: clamp(current.y, 8, window.innerHeight - h - 8),
        };
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onDragStart(clientX: number, clientY: number) {
    if (!pos) return;
    dragState.current = { dragging: true, moved: false, startX: clientX, startY: clientY, originX: pos.x, originY: pos.y };
    setDimmed(false);
  }
  function onDragMove(clientX: number, clientY: number) {
    if (!dragState.current.dragging) return;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.current.moved = true;
    const { w, h } = getSize(open);
    setPos({
      x: clamp(dragState.current.originX + dx, 8, window.innerWidth - w - 8),
      y: clamp(dragState.current.originY + dy, 8, window.innerHeight - h - 8),
    });
  }
  function onDragEnd() {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    setPos((current) => {
      if (current) {
        try {
          window.localStorage.setItem(POSITION_KEY, JSON.stringify(current));
        } catch {
          // best-effort persistence only
        }
      }
      return current;
    });
  }

  // ---------- Auto-dim when idle (collapsed bubble only) ----------
  const [dimmed, setDimmed] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function resetIdleTimer() {
    setDimmed(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!open) idleTimer.current = setTimeout(() => setDimmed(true), IDLE_DIM_MS);
  }
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The actual fix for "opens off-screen": the collapsed bubble (52px)
  // can legally sit much closer to an edge than the expanded panel
  // (280x420) can. The moment it opens, pull the position back inside
  // bounds for the EXPANDED size — this is what stops a bubble parked
  // near a corner from opening into a panel that's half off-screen.
  useEffect(() => {
    if (open) {
      setPos((current) => {
        if (!current) return current;
        const { w, h } = getSize(true);
        return {
          x: clamp(current.x, 8, window.innerWidth - w - 8),
          y: clamp(current.y, 8, window.innerHeight - h - 8),
        };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Opening picks up whatever the active bill total is RIGHT NOW, and
  // defaults into Change mode when there IS one — that's the actual
  // everyday use case ("customer handed me ₹500, what's the change").
  useEffect(() => {
    if (open && !wasOpen.current) {
      const hasBill = !!billAmount && billAmount > 0;
      setMode(hasBill ? "change" : "calc");
      setReceivedInput("");
      setDisplay("0");
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(false);
    }
    wasOpen.current = open;
  }, [open, billAmount]);

  if (!enabled || !pos) return null;

  function inputDigit(d: string) {
    if (mode === "change") {
      setReceivedInput((prev) => (prev === "0" ? d : prev.length < 12 ? prev + d : prev));
      return;
    }
    if (waitingForOperand) {
      setDisplay(d);
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev === "0" ? d : prev.length < 14 ? prev + d : prev));
  }

  function inputDecimal() {
    if (mode === "change") {
      setReceivedInput((prev) => (prev.includes(".") ? prev : (prev || "0") + "."));
      return;
    }
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev.includes(".") ? prev : prev + "."));
  }

  function backspace() {
    if (mode === "change") {
      setReceivedInput((prev) => (prev.length > 1 ? prev.slice(0, -1) : ""));
      return;
    }
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }

  function clearAll() {
    if (mode === "change") {
      setReceivedInput("");
      return;
    }
    setDisplay("0");
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  }

  function handlePercent() {
    if (mode === "change") return;
    setDisplay(String(round(parseFloat(display) / 100)));
  }

  function performOperation(nextOperator: string) {
    if (mode === "change") return;
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
    if (mode === "change") return;
    const inputValue = parseFloat(display);
    if (operator && previousValue !== null) {
      const result = calc(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  }

  const received = parseFloat(receivedInput || "0") || 0;
  const bill = billAmount ?? 0;
  const changeDue = round(received - bill);

  if (!open) {
    return (
      <button
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onDragMove(e.clientX, e.clientY)}
        onPointerUp={() => {
          onDragEnd();
          resetIdleTimer();
          if (!dragState.current.moved) setOpen(true);
        }}
        aria-label="Open calculator"
        className="fixed z-40 flex items-center justify-center rounded-full bg-brand text-white transition-opacity duration-500"
        style={{
          left: pos.x,
          top: pos.y,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          opacity: dimmed ? 0.4 : 1,
          touchAction: "none",
        }}
      >
        <CalculatorIcon size={22} />
      </button>
    );
  }

  return (
    <div
      className="fixed z-40 flex w-[280px] flex-col overflow-hidden rounded-2xl bg-surface"
      style={{ left: pos.x, top: pos.y, boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }}
    >
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onDragMove(e.clientX, e.clientY)}
        onPointerUp={onDragEnd}
        className="flex items-center justify-between border-b border-border bg-brand px-3.5 py-2.5"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <span className="text-sm font-semibold text-white">{mode === "change" ? "Change due" : "Calculator"}</span>
        <div className="flex items-center gap-1">
          {billAmount !== null && billAmount > 0 && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMode((m) => (m === "change" ? "calc" : "change"))}
              aria-label="Switch mode"
              className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-medium text-white"
            >
              <ArrowLeftRight size={11} />
              {mode === "change" ? "Calc" : "Change"}
            </button>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOpen(false)}
            aria-label="Close calculator"
            className="rounded-full p-1 text-white/80 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {mode === "change" ? (
        <div className="flex flex-col gap-2 bg-background px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Bill amount</span>
            <span className="font-medium text-foreground">{formatMoney(bill)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Customer gave</span>
            <div className="truncate text-right font-mono text-2xl font-semibold text-foreground">
              {receivedInput ? formatMoney(received) : "₹0"}
            </div>
          </div>
          {receivedInput && (
            <div
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                changeDue >= 0 ? "bg-brand-soft text-brand-text" : "bg-danger-soft text-danger"
              }`}
            >
              <span>{changeDue >= 0 ? "Change to return" : "Still short by"}</span>
              <span>{formatMoney(Math.abs(changeDue))}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 bg-background px-4 py-3">
          <div className="truncate text-right font-mono text-3xl font-semibold text-foreground">{display}</div>
          {operator && previousValue !== null && (
            <div className="text-right text-xs text-muted">
              {formatMoney(previousValue)} {operator}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-px bg-border p-px">
        <CalcKey label="C" onClick={clearAll} variant="muted" />
        <CalcKey icon={<Delete size={16} />} onClick={backspace} variant="muted" />
        <CalcKey label="%" onClick={handlePercent} variant="muted" disabled={mode === "change"} />
        <CalcKey label="÷" onClick={() => performOperation("÷")} variant="operator" active={operator === "÷"} disabled={mode === "change"} />

        <CalcKey label="7" onClick={() => inputDigit("7")} />
        <CalcKey label="8" onClick={() => inputDigit("8")} />
        <CalcKey label="9" onClick={() => inputDigit("9")} />
        <CalcKey label="×" onClick={() => performOperation("×")} variant="operator" active={operator === "×"} disabled={mode === "change"} />

        <CalcKey label="4" onClick={() => inputDigit("4")} />
        <CalcKey label="5" onClick={() => inputDigit("5")} />
        <CalcKey label="6" onClick={() => inputDigit("6")} />
        <CalcKey label="−" onClick={() => performOperation("−")} variant="operator" active={operator === "−"} disabled={mode === "change"} />

        <CalcKey label="1" onClick={() => inputDigit("1")} />
        <CalcKey label="2" onClick={() => inputDigit("2")} />
        <CalcKey label="3" onClick={() => inputDigit("3")} />
        <CalcKey label="+" onClick={() => performOperation("+")} variant="operator" active={operator === "+"} disabled={mode === "change"} />

        <CalcKey label="0" onClick={() => inputDigit("0")} wide />
        <CalcKey label="." onClick={inputDecimal} />
        <CalcKey label="=" onClick={handleEquals} variant="equals" disabled={mode === "change"} />
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
  disabled = false,
}: {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "muted" | "operator" | "equals";
  active?: boolean;
  wide?: boolean;
  disabled?: boolean;
}) {
  const base = "flex h-14 items-center justify-center text-lg font-medium select-none disabled:opacity-30";
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
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${wide ? "col-span-2" : ""}`}>
      {icon ?? label}
    </button>
  );
}
