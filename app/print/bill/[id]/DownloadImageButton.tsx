"use client";

import { useState } from "react";

export function DownloadImageButton({ invoiceNumber }: { invoiceNumber: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setIsGenerating(true);
    try {
      const element = document.getElementById("invoice-capture-area");
      if (!element) throw new Error("Could not find invoice content");

      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 2, // sharper image — important for a WhatsApp-shared invoice
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `invoice-${invoiceNumber.replace(/\//g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Invoice image generation failed:", err);
      setError("Could not generate image. Try Print instead.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDownload}
        disabled={isGenerating}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-60"
      >
        {isGenerating ? "Preparing…" : "Download image"}
      </button>
      {error && <p className="text-xs text-credit">{error}</p>}
    </div>
  );
}
