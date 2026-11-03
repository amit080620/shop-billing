"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies one migration file (served by app/admin/migration/[file]) for the Supabase SQL editor.
 * Fetched on the tap, so the admin page doesn't carry the SQL; if the copy is refused, the file
 * opens in a new tab to copy by hand. */
export function CopyMigrationFileButton({ file, label }: { file: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const href = `/admin/migration/${file}`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const response = await fetch(href, { cache: "no-store" });
          if (!response.ok) throw new Error(String(response.status));
          await navigator.clipboard.writeText(await response.text());
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          window.open(href, "_blank", "noopener");
        }
      }}
      className="flex w-fit items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-gray-950"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied — paste it in the SQL editor" : label}
    </button>
  );
}
