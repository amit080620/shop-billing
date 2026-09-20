"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { PLANS_MIGRATION_SQL } from "@/lib/planMigration";

export function CopyMigrationButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(PLANS_MIGRATION_SQL);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.prompt("Copy this SQL:", PLANS_MIGRATION_SQL);
        }
      }}
      className="flex w-fit items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-gray-950"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied — paste it in the SQL editor" : "Copy the SQL"}
    </button>
  );
}
