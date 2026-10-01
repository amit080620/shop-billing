"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { saveOnboardingNoteAction, setOnboardingTickAction } from "@/lib/actions/admin-onboarding";

type Step = { id: string; stage: string; title: string; hint?: string; byData: boolean; byHand: boolean; done: boolean; tickable: boolean };

/** The pilot set-up checklist on a shop's admin page: data-driven ticks show "auto", the rest are
 * ticked here; one note for what the owner said. */
export function OnboardingChecklist({ shopId, steps, note, videosLink }: { shopId: string; steps: Step[]; note: string; videosLink: string }) {
  const [hand, setHand] = useState<Record<string, boolean>>(Object.fromEntries(steps.map((s) => [s.id, s.byHand])));
  const [text, setText] = useState(note);
  const [savedNote, setSavedNote] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const isDone = (s: Step) => s.byData || hand[s.id];
  const done = steps.filter(isDone).length;
  const stages = [...new Set(steps.map((s) => s.stage))];

  function toggle(s: Step) {
    const next = !hand[s.id];
    setHand({ ...hand, [s.id]: next });
    start(async () => {
      const res = await setOnboardingTickAction(shopId, s.id, next);
      if (res.error) {
        setError(res.error);
        setHand((h) => ({ ...h, [s.id]: !next }));
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Pilot set-up checklist</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${done === steps.length ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-200"}`}>
          {done} / {steps.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {stages.map((stage) => (
        <div key={stage} className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{stage}</p>
          {steps
            .filter((s) => s.stage === stage)
            .map((s) => (
              <div key={s.id} className="flex items-start gap-2 rounded-lg px-1 py-1">
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  disabled={!s.tickable || pending || s.byData}
                  aria-pressed={isDone(s)}
                  aria-label={s.title}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${isDone(s) ? "border-emerald-500 bg-emerald-600 text-white" : "border-gray-600"} ${!s.tickable || s.byData ? "cursor-default" : ""}`}
                >
                  {isDone(s) && <Check size={13} strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${isDone(s) ? "text-gray-400 line-through decoration-gray-600" : "text-gray-100"}`}>
                    {s.title}
                    {s.byData && <span className="ml-1.5 rounded bg-emerald-900/60 px-1 py-px text-[10px] font-semibold text-emerald-300 no-underline">auto</span>}
                  </p>
                  {s.hint && !isDone(s) && <p className="text-[11px] text-gray-500">{s.hint}</p>}
                  {s.id === "videos" && !isDone(s) && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(videosLink);
                        setCopied(true);
                      }}
                      className="mt-0.5 flex items-center gap-1 text-[11px] text-indigo-300 underline"
                    >
                      <Copy size={11} /> {copied ? "Copied" : videosLink}
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      ))}

      <label className="flex flex-col gap-1 text-xs text-gray-300">
        Note — what they like, what&apos;s missing, what we promised
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-sm text-gray-100" />
      </label>
      <button
        type="button"
        disabled={pending || text === savedNote}
        onClick={() =>
          start(async () => {
            const res = await saveOnboardingNoteAction(shopId, text);
            if (res.error) setError(res.error);
            else setSavedNote(text);
          })
        }
        className="self-start rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-50"
      >
        {text === savedNote ? "Note saved" : "Save note"}
      </button>
    </section>
  );
}
