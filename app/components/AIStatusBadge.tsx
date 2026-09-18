"use client";

import { useImperativeHandle, forwardRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { AIScanErrorType } from "@/lib/actions/aiScan";
import type { AssistantStatus } from "@/lib/actions/assistant";

type Status = "idle" | AIScanErrorType | AssistantStatus;
export type AIProvider = "scan" | "voice";

/** Shop-owner wording. Key/config problems are the platform's to fix,
 * not the shop's, so they read as "not available" rather than exposing
 * setup details like an invalid API key. */
function message(provider: AIProvider, status: Status): string | null {
  const feature = provider === "voice" ? "Voice billing" : "AI scan";
  switch (status) {
    case "quota_exceeded":
      return `${feature} has reached today's limit — try again tomorrow`;
    case "network_error":
      return `Couldn't reach ${feature} — check your internet`;
    case "not_configured":
    case "invalid_key":
    case "config_error":
      return `${feature} isn't available right now`;
    default:
      return null;
  }
}

/** Silent until a real AI attempt fails, then explains it in plain words.
 * It used to ping the AI provider every time a billing screen opened —
 * spending quota and showing setup errors ("key invalid") to shop
 * owners who hadn't even tried the feature. */
export type AIStatusBadgeHandle = { reportError: (type: AIScanErrorType | AssistantStatus) => void };

export const AIStatusBadge = forwardRef<AIStatusBadgeHandle, { provider?: AIProvider }>(
  function AIStatusBadge({ provider = "scan" }, ref) {
    const [status, setStatus] = useState<Status>("idle");

    useImperativeHandle(ref, () => ({ reportError: setStatus }));

    const text = message(provider, status);
    if (!text) return null;
    return (
      <span role="status" className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
        <Sparkles size={11} />
        {text}
      </span>
    );
  },
);
