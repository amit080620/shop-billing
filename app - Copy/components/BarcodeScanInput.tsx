"use client";

import { useRef, useState } from "react";

export function BarcodeScanInput({
  onScan,
  placeholder = "Scan barcode, or type it and press Enter",
}: {
  onScan: (code: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      onScan(value.trim());
      setValue("");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-muted">
        <path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14" />
      </svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        inputMode="text"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
