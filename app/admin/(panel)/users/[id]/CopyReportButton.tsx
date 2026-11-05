"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyReportButton({ report }: { report: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(report);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt("Copy this report:", report);
        }
      }}
      className="flex w-fit items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy report"}
    </button>
  );
}
