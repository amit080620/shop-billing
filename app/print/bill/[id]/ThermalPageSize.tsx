"use client";

import { useEffect } from "react";

/** A thermal roll's paper is as long as the bill. CSS has no "as long as the content" page size
 * ("58mm auto" is not valid, so browsers fell back to A4 and printed the bill at the top of a tall
 * empty page), so the page is sized to the receipt's measured height — now, and again just before
 * every print, since the Print button and Ctrl+P both raise `beforeprint`. */
export function ThermalPageSize({ widthMm }: { widthMm: 58 | 80 }) {
  useEffect(() => {
    const style = document.createElement("style");
    document.head.appendChild(style);
    const size = () => {
      const receipt = document.querySelector<HTMLElement>("[data-thermal-receipt]");
      if (!receipt) return;
      // CSS pixels are 96 per inch; 4mm for the page margins and a little room so nothing spills onto a second page.
      const heightMm = Math.ceil((receipt.getBoundingClientRect().height * 25.4) / 96) + 8;
      style.textContent = `@media print { @page { size: ${widthMm}mm ${heightMm}mm; margin: 2mm; } }`;
    };
    size();
    window.addEventListener("beforeprint", size);
    return () => {
      window.removeEventListener("beforeprint", size);
      style.remove();
    };
  }, [widthMm]);
  return null;
}
