"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded bg-black px-3 py-1.5 text-sm text-white"
    >
      Print
    </button>
  );
}
