"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { askAssistantAction, getProactiveBriefingAction, type ChatMessage, type ReminderAction } from "@/lib/actions/assistant";
import { useToolLauncher, panelAnchor } from "@/lib/toolLauncher";

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 420;
const PANEL = { w: PANEL_WIDTH, h: PANEL_HEIGHT };
const BRIEFING_KEY = "ray-assistant-briefed-on";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type DisplayMessage = ChatMessage & { action?: ReminderAction; proactive?: boolean };

/** A floating chat panel opened from the assistant button in the app
 * header, draggable like the calculator panel (see FloatingCalculator.tsx),
 * kept as a genuinely separate component rather than merged into it
 * — different job, different data, and combining them into one
 * "everything bubble" would make each harder to use at speed, which
 * defeats the entire point of a fast, single-purpose tool. */
export function FloatingAssistant({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasCheckedBriefing = useRef(false);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ dragging: boolean; moved: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  useToolLauncher("assistant", () => {
    setPos(panelAnchor(PANEL_WIDTH));
    setOpen(true);
  });

  useEffect(() => {
    if (!open) return;
    setPos((current) => {
      if (!current) return current;
      const { w, h } = PANEL;
      return { x: clamp(current.x, 8, window.innerWidth - w - 8), y: clamp(current.y, 8, window.innerHeight - h - 8) };
    });

    // The panel is `position: fixed` with its own pixel coordinates —
    // scrolling the page (what the app's global keyboard-avoidance
    // does for normal inputs) has zero effect on it. This listens to
    // the keyboard's own resize event directly and pulls the panel
    // up above it, so the chat input never ends up hidden behind the
    // keyboard on a phone.
    function keepAboveKeyboard() {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setPos((current) => {
        if (!current) return current;
        const { h } = PANEL;
        const maxY = viewportHeight - h - 8;
        return current.y > maxY ? { ...current, y: Math.max(8, maxY) } : current;
      });
    }
    window.visualViewport?.addEventListener("resize", keepAboveKeyboard);
    return () => window.visualViewport?.removeEventListener("resize", keepAboveKeyboard);
     
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Proactive briefing — genuinely once a day, the first time the
    // chat is opened. An attentive employee glances at overdue udhar
    // and low stock without being asked; this is that, but capped so
    // it never nags on every single open.
    const today = new Date().toDateString();
    if (!hasCheckedBriefing.current && localStorage.getItem(BRIEFING_KEY) !== today) {
      hasCheckedBriefing.current = true;
      localStorage.setItem(BRIEFING_KEY, today);
      getProactiveBriefingAction().then((result) => {
        if (result.answer) {
          setMessages((prev) => [...prev, { role: "assistant", text: result.answer!, proactive: true }]);
        }
      });
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

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
    dragState.current.dragging = false;
  }

  async function send() {
    const question = input.trim();
    if (!question || isThinking) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setIsThinking(true);
    const result = await askAssistantAction(
      question,
      messages.map((m) => ({ role: m.role, text: m.text })),
    );
    setIsThinking(false);
    if (result.error === "not_configured") {
      setNotConfigured(true);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", text: result.answer ?? result.error ?? "Something went wrong.", action: result.action }]);
  }

  if (!enabled || !pos) return null;

  if (!open) return null;

  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-2xl bg-surface"
      style={{ left: pos.x, top: pos.y, width: PANEL_WIDTH, height: PANEL_HEIGHT, boxShadow: "0 16px 40px rgba(0,0,0,0.35)" }}
    >
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onDragMove(e.clientX, e.clientY)}
        onPointerUp={onDragEnd}
        className="flex items-center justify-between border-b border-border bg-gradient-to-r from-brand to-brand-dark px-3.5 py-2.5"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Sparkles size={14} /> Ask about your shop
        </span>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-full p-1 text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {notConfigured ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <Sparkles size={22} className="text-muted" />
          <p className="text-sm font-medium text-foreground">The assistant is not set up yet</p>
          <p className="text-xs text-muted">Free Groq API key set up karni hogi (scan features se alag).</p>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-background p-3 text-xs text-muted">
                <p className="font-medium text-foreground">Ye poochh kar dekhein:</p>
                <p>&quot;Aaj kitna business hua?&quot;</p>
                <p>&quot;Kitne customers hain mere paas?&quot;</p>
                <p>&quot;Ramesh ko udhar reminder bhejo&quot;</p>
                <p>&quot;Kaunse items stock mein kam hain?&quot;</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "self-end bg-brand text-white" : m.proactive ? "self-start border border-border bg-surface text-brand-text" : "self-start bg-background text-foreground"
                  }`}
                >
                  {m.proactive && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"><Sparkles size={9} /> Heads up</p>}
                  {m.text}
                </div>
                {m.action && (
                  <a
                    href={m.action.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    📤 {m.action.label}
                  </a>
                )}
              </div>
            ))}
            {isThinking && (
              <div className="flex items-center gap-1.5 self-start rounded-xl bg-background px-3 py-2 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" /> Aapka data check kar rahe hain…
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Poochein kuch bhi…"
              disabled={isThinking}
              className="min-w-0 flex-1 rounded-full border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={isThinking || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
