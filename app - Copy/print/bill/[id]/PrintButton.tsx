"use client";

import { useState } from "react";

export function PrintButton() {
  const [justClicked, setJustClicked] = useState(false);

  return (
    <button
      onClick={() => {
        setJustClicked(true);
        window.print();
        setTimeout(() => setJustClicked(false), 900);
      }}
      className={`rounded bg-black px-3 py-1.5 text-sm text-white transition-transform active:scale-90 ${justClicked ? "animate-save-success" : ""}`}
    >
      {justClicked ? "Printing…" : "Print"}
    </button>
  );
}
