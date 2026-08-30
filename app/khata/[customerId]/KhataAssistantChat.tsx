"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { askCustomerAssistantAction, type CustomerChatMessage } from "@/lib/actions/customerAssistant";

/** "Poochho apna hisaab" — a customer-facing AI chat embedded right on
 * their own shared khata page. Nothing here needs the customer to
 * sign in (same trust model as the khata page itself — an unguessable
 * link is the access control), and every answer is scoped hard to
 * THIS customerId by customerAssistant.ts, never anyone else's data
 * or the shop's wider numbers. This is a genuinely different kind of
 * feature from an owner-facing dashboard — the customer gets to ask
 * their own questions instead of scrolling a list looking for one
 * bill. */
export function KhataAssistantChat({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CustomerChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  async function send() {
    const question = input.trim();
    if (!question || isThinking) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setIsThinking(true);
    const result = await askCustomerAssistantAction(customerId, question, messages);
    setIsThinking(false);
    if (result.error === "not_configured") {
      setNotConfigured(true);
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", text: result.answer ?? result.error ?? "Something went wrong." }]);
  }

  if (notConfigured) return null; // no key set up — quietly omit rather than show a broken chat to a customer

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand bg-brand-soft px-4 py-3 text-sm font-medium text-brand-text"
      >
        <Sparkles size={15} /> Poochho apna hisaab
      </button>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border bg-brand-soft px-3.5 py-2.5">
        <Sparkles size={14} className="text-brand-text" />
        <span className="text-sm font-semibold text-brand-text">Poochho apna hisaab</span>
      </div>
      <div ref={scrollRef} className="flex max-h-72 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1 rounded-lg bg-background p-2.5 text-xs text-muted">
            <p>&quot;Mera kitna udhar hai?&quot;</p>
            <p>&quot;Maine last month kya khareeda tha?&quot;</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-brand text-white" : "self-start bg-background text-foreground"}`}>
            {m.text}
          </div>
        ))}
        {isThinking && (
          <div className="flex items-center gap-1.5 self-start rounded-xl bg-background px-3 py-2 text-xs text-muted">
            <Loader2 size={12} className="animate-spin" /> Dekh rahe hain…
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Poochein…"
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
    </div>
  );
}
