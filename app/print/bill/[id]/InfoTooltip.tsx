"use client";

import { useState } from "react";
import { Info } from "lucide-react";

export function InfoTooltip({ message }: { message: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More info"
        className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500"
        style={{ boxShadow: "-2px -2px 4px rgba(255,255,255,0.9), 2px 2px 4px rgba(0,0,0,0.12)" }}
      >
        <Info size={13} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl bg-white p-3 text-left text-xs leading-relaxed text-gray-600"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
