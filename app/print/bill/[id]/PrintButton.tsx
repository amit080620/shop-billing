"use client";

import { useState } from "react";
import Link from "next/link";

export function PrintButton() {
  const [justClicked, setJustClicked] = useState(false);

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <button
        onClick={() => {
          setJustClicked(true);
          window.print();
          setTimeout(() => setJustClicked(false), 900);
        }}
        className={`rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition-transform active:scale-90 ${justClicked ? "animate-save-success" : ""}`}
        style={{ boxShadow: "-2px -2px 4px rgba(255,255,255,0.15), 2px 2px 6px rgba(0,0,0,0.35)" }}
      >
        {justClicked ? "Printing…" : "Print"}
      </button>
      <Link href="/fast-print-setup" className="text-[10px] text-gray-400 underline">
        Bina dialog ke print karna hai? Setup karein
      </Link>
    </div>
  );
}
