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
  network_error: "AI unreachable",
};

/** Green when the AI scan is genuinely reachable, gray when nobody's
 * configured a key yet (not an error — the free OCR fallback just
 * handles everything), red for anything that needs attention (quota
 * used up, a bad key, network trouble). One cheap connectivity check
 * per page visit — negligible against the free tier's daily
 * allowance — plus `ref.current.reportError(type)` lets the actual
 * scan flow flip this red immediately if quota runs out mid-session,
 * without waiting for the next check. */
export const AIStatusBadge = forwardRef<{ reportError: (type: AIScanErrorType) => void }, object>(
  function AIStatusBadge(_props, ref) {
    const [status, setStatus] = useState<Status>("checking");

    useEffect(() => {
      let cancelled = false;
      checkAIScanStatusAction().then((r) => {
        if (!cancelled) setStatus(r.status);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      reportError: (type: AIScanErrorType) => setStatus(type),
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
