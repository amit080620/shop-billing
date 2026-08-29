"use client";

import { useEffect, useImperativeHandle, forwardRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { checkAIScanStatusAction, type AIScanErrorType } from "@/lib/actions/aiScan";

type Status = "checking" | "connected" | AIScanErrorType;

const LABELS: Record<Status, string> = {
  checking: "Checking AI…",
  connected: "AI scan connected",
  not_configured: "AI scan not set up",
  quota_exceeded: "AI quota used up today",
  invalid_key: "AI key invalid",
  config_error: "AI setup error",
  network_error: "AI unreachable",
};

const CACHE_KEY = "ray-ai-status-cache";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function readCache(): Status | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { status, at } = JSON.parse(raw) as { status: Status; at: number };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return status;
  } catch {
    return null;
  }
}

function writeCache(status: Status) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ status, at: Date.now() }));
  } catch {
    // best-effort only
  }
}

/** Green when the AI scan is genuinely reachable, gray when nobody's
 * configured a key yet (not an error — the free OCR fallback just
 * handles everything), red for anything that needs attention (quota
 * used up, a bad key, network trouble).
 *
 * Deliberately does NOT re-check on every page visit — that would
 * spend a real quota request just from someone opening the scan
 * screen without ever scanning anything. Instead this caches the
 * result in sessionStorage for 15 minutes; visiting again inside
 * that window reuses the cached status for free. A REAL scan attempt
 * still updates it instantly via `ref.current.reportError(type)`
 * regardless of the cache, since that's genuine, already-spent
 * information, not an extra check. */
export const AIStatusBadge = forwardRef<{ reportError: (type: AIScanErrorType) => void }, object>(
  function AIStatusBadge(_props, ref) {
    const [status, setStatus] = useState<Status>("checking");

    useEffect(() => {
      const cached = readCache();
      if (cached) {
        setStatus(cached);
        return;
      }
      let cancelled = false;
      checkAIScanStatusAction().then((r) => {
        if (cancelled) return;
        setStatus(r.status);
        writeCache(r.status);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      reportError: (type: AIScanErrorType) => {
        setStatus(type);
        writeCache(type);
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
        {LABELS[status]}
      </span>
    );
  },
);
