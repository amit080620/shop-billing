"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Send, CheckCircle2, PlayCircle } from "lucide-react";
import { useBusinessType } from "@/lib/BusinessTypeContext";
import { findVideos } from "@/lib/videoSearch";
import { mmss } from "@/lib/trainingVideos";
import { submitSupportRequestAction, type SupportCategory } from "@/lib/actions/support";
import { SALES_WHATSAPP_CONFIRMED, salesLink } from "@/lib/sales";
import { useT } from "@/lib/i18n/LangContext";

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "billing", label: "Billing / payment issue" },
  { value: "technical", label: "Something's not working" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Something else" },
];

/** The "who do I actually reach if something breaks" gap — every other
 * screen under Help answers "how do I do X", none of them answered
 * "what if I'm stuck". A submitted issue gets a reference number
 * (SR-xxxxxxxx) shown right back on screen, so the person has proof it
 * was actually sent and something to quote if they follow up — not
 * just a form that vanishes into the void. WhatsApp stays alongside it
 * for anything that genuinely can't wait. */
export function ContactSupport({ shopName, ownerPhone }: { shopName: string; ownerPhone: string | null }) {
  const { t } = useT();
  const [category, setCategory] = useState<SupportCategory>("technical");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ticketId?: string; error?: string } | null>(null);
  const [sentMessage, setSentMessage] = useState("");
  const router = useRouter();
  const businessType = useBusinessType();
  // While they type, the training video that may already answer it — opened at the right second.
  const videos = useMemo(() => (message.trim().length >= 5 && businessType ? findVideos(message, businessType) : []), [message, businessType]);

  function submit() {
    startTransition(async () => {
      const res = await submitSupportRequestAction(category, message);
      setResult(res.ok ? { ticketId: res.ticketId } : { error: res.error });
      if (res.ok) {
        setSentMessage(message.trim().slice(0, 300));
        setMessage("");
        router.refresh(); // it appears under "Your requests"
      }
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{t("help.contact.title")}</h2>
      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">{t("help.contact.subtitle")}</p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("help.contact.category")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)} className="px-3.5 py-3 text-base">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{t(c.label)}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("help.contact.message")}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder={t("help.contact.placeholder")}
            className="px-3.5 py-3 text-base"
          />
        </label>

        {videos.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-brand/30 bg-brand-soft/60 p-2.5">
            <p className="text-xs font-semibold text-brand-text">{t("These videos may already answer it:")}</p>
            {videos.map((v) => (
              <Link key={v.video.id} href={`/help/videos/${v.video.id}?t=${v.t}`} className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-xs">
                <PlayCircle size={15} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{v.topic}</span>
                  <span className="block truncate text-muted">{v.video.title}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{mmss(v.t)}</span>
              </Link>
            ))}
          </div>
        )}

        {result?.error && <p className="text-sm text-danger">{result.error}</p>}
        {result?.ticketId && (
          <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5 text-sm text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              {t("help.contact.sent")} <span className="font-mono font-semibold">{result.ticketId}</span>
              <br />
              <span className="text-xs opacity-90">{t("help.contact.sentSub")}</span>
            </span>
          </p>
        )}
        {result?.ticketId && SALES_WHATSAPP_CONFIRMED && (
          // The same request on WhatsApp too, quoting its number, for anything that can't wait.
          <a
            href={salesLink(`Hi, this is ${shopName}${ownerPhone ? ` (${ownerPhone})` : ""}. My support request ${result.ticketId}: ${sentMessage}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3.5 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle size={15} />
            {t("Also send {sr} on WhatsApp", { sr: result.ticketId })}
          </a>
        )}

        <button onClick={submit} disabled={pending || !message.trim()} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
          <Send size={15} />
          {pending ? t("auth.pleaseWait") : t("help.contact.submit")}
        </button>

        {SALES_WHATSAPP_CONFIRMED && (
          <a
            href={salesLink(`Hi, this is ${shopName}${ownerPhone ? ` (${ownerPhone})` : ""}. I need help with: `)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm font-medium text-foreground"
          >
            <MessageCircle size={15} />
            {t("help.contact.whatsapp")}
          </a>
        )}
      </div>
    </section>
  );
}
