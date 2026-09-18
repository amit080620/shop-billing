"use client";

import { useEffect, useRef, useState } from "react";
import { X, Delete, ArrowLeftRight } from "lucide-react";
import { useCalculatorAmount } from "@/lib/calculatorAmount";
import { formatMoney } from "@/lib/format";
import { useToolLauncher, panelAnchor } from "@/lib/toolLauncher";

const EXPANDED_WIDTH = 280;
const EXPANDED_HEIGHT = 420;

// The panel only exists while open, so its size is fixed.
const PANEL = { w: EXPANDED_WIDTH, h: EXPANDED_HEIGHT };

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

/** A floating, draggable calculator panel, opened from the calculator
 * button in the app header (see HeaderTools). It no longer leaves a
 * bubble on screen when closed — a bubble always ended up covering
 * some screen's main button. Mounted once in the dashboard layout
 * (toggleable off in Preferences).
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

  useToolLauncher("calculator", () => {
    setPos(panelAnchor(EXPANDED_WIDTH));
    setOpen(true);
  });

  useEffect(() => {
    function onResize() {
      setPos((current) => {
        if (!current) return current;
        const { w, h } = PANEL;
        return {
          x: clamp(current.x, 8, window.innerWidth - w - 8),
          y: clamp(current.y, 8, window.innerHeight - h - 8),
        };
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
     
  }, [open]);

  function onDragStart(clientX: number, clientY: number) {
    if (!pos) return;
    dragState.current = { dragging: true, moved: false, startX: clientX, startY: clientY, originX: pos.x, originY: pos.y };
  }
  function onDragMove(clientX: number, clientY: number) {
    if (!dragState.current.dragging) return;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.current.moved = true;
    const { w, h } = PANEL;
    setPos({
      x: clamp(dragState.current.originX + dx, 8, window.innerWidth - w - 8),
      y: clamp(dragState.current.originY + dy, 8, window.innerHeight - h - 8),
    });
  }
  function onDragEnd() {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
  }

  // The actual fix for "opens off-screen": the collapsed bubble (52px)
  // can legally sit much closer to an edge than the expanded panel
  // (280x420) can. The moment it opens, pull the position back inside
  // bounds for the EXPANDED size — this is what stops a bubble parked
  // near a corner from opening into a panel that's half off-screen.
  useEffect(() => {
    if (open) {
      setPos((current) => {
        if (!current) return current;
        const { w, h } = PANEL;
        return {
          x: clamp(current.x, 8, window.innerWidth - w - 8),
          y: clamp(current.y, 8, window.innerHeight - h - 8),
        };
      });
    }
     
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

  if (!open) return null;

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
