"use client";

import { useEffect, useImperativeHandle, forwardRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { checkAIScanStatusAction, type AIScanErrorType } from "@/lib/actions/aiScan";
import { checkAssistantStatusAction, type AssistantStatus } from "@/lib/actions/assistant";

type Status = "checking" | "connected" | AIScanErrorType | AssistantStatus;
export type AIProvider = "scan" | "voice";

const LABELS: Record<"scan" | "voice", Record<Status, string>> = {
  scan: {
    checking: "Checking AI…",
    connected: "AI scan connected",
    not_configured: "AI scan not set up",
    quota_exceeded: "AI quota used up today",
    invalid_key: "AI key invalid",
    config_error: "AI setup error",
    network_error: "AI unreachable",
  },
  voice: {
    checking: "Checking AI…",
    connected: "Voice AI connected",
    not_configured: "Voice AI not set up",
    quota_exceeded: "Voice AI quota used up today",
    invalid_key: "Voice AI key invalid",
    config_error: "Voice AI setup error",
    network_error: "Voice AI unreachable",
  },
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function readCache(key: string): Status | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { status, at } = JSON.parse(raw) as { status: Status; at: number };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return status;
  } catch {
    return null;
  }
}

function writeCache(key: string, status: Status) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ status, at: Date.now() }));
  } catch {
    // best-effort only
  }
}

/** Green when the AI is genuinely reachable, gray when nobody's
 * configured a key yet (not an error — the relevant fallback just
 * handles everything), red for anything that needs attention (quota
 * used up, a bad key, network trouble).
 *
 * Works for either AI provider this app uses: `provider="scan"`
 * checks the Gemini key (used by Scan price list / Scan vendor bill),
 * `provider="voice"` checks the Groq key (used by Voice Billing and
 * the AI shop assistant) — same badge component, same caching
 * behavior, just pointed at a different status-check action and
 * cache key so the two never overwrite each other.
 *
 * Deliberately does NOT re-check on every page visit — that would
 * spend a real quota request just from someone opening the screen
 * without ever using the AI feature. Instead this caches the result
 * in sessionStorage for 15 minutes; visiting again inside that window
 * reuses the cached status for free. A REAL attempt still updates it
 * instantly via `ref.current.reportError(type)` regardless of the
 * cache, since that's genuine, already-spent information. */
export type AIStatusBadgeHandle = { reportError: (type: AIScanErrorType | AssistantStatus) => void };

export const AIStatusBadge = forwardRef<AIStatusBadgeHandle, { provider?: AIProvider }>(
  function AIStatusBadge({ provider = "scan" }, ref) {
    const [status, setStatus] = useState<Status>("checking");
    const cacheKey = `ray-ai-status-cache-${provider}`;

    useEffect(() => {
      const cached = readCache(cacheKey);
      if (cached) {
        setStatus(cached);
        return;
      }
      let cancelled = false;
      const check = provider === "voice" ? checkAssistantStatusAction() : checkAIScanStatusAction();
      check.then((r) => {
        if (cancelled) return;
        setStatus(r.status);
        writeCache(cacheKey, r.status);
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider]);

    useImperativeHandle(ref, () => ({
      reportError: (type: AIScanErrorType | AssistantStatus) => {
        setStatus(type);
        writeCache(cacheKey, type);
      },
    }));

    const color =
      status === "connected"
        ? "bg-success-soft text-success"
        : status === "not_configured" || status === "checking"
          ? "bg-surface-2 text-muted"
          : "bg-danger-soft text-danger";

    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
        <Sparkles size={10} />
        {LABELS[provider][status]}
      </span>
    );
  },
);
