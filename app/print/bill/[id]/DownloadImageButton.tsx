"use client";

import { useState } from "react";

// 1 CSS px = 0.264583mm at the standard 96dpi reference used by browsers.
const PX_TO_MM = 0.264583;

export function DownloadImageButton({
  invoiceNumber,
  upiLink,
  isThermal,
}: {
  invoiceNumber: string;
  upiLink?: string | null;
  isThermal: boolean;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setIsGenerating(true);
    try {
      const element = document.getElementById("invoice-capture-area");
      if (!element) throw new Error("Could not find invoice content");

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const scale = 2; // sharper image than 1:1 capture
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");

      const elRect = element.getBoundingClientRect();
      const contentWidthMm = elRect.width * PX_TO_MM;
      const contentHeightMm = elRect.height * PX_TO_MM;

      // Thermal: a narrow custom page that hugs the receipt's own height.
      // Full page: standard A4, image placed with a small margin.
      const margin = isThermal ? 0 : 10;
      const pageFormat: [number, number] = isThermal
        ? [80, contentHeightMm + margin * 2]
        : [210, 297]; // A4 in mm

      const pdf = new jsPDF({
        unit: "mm",
        format: pageFormat,
        orientation: "portrait",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const renderWidth = pageWidth - margin * 2;
      const renderHeight = (contentHeightMm / contentWidthMm) * renderWidth;

      pdf.addImage(imgData, "PNG", margin, margin, renderWidth, renderHeight);

      // Make the UPI QR area a real tappable link in the PDF, positioned by
      // measuring the actual QR block element rather than guessing coordinates
      // — stays correct regardless of how long the item list is.
      if (upiLink) {
        const qrBlock = element.querySelector("#upi-qr-block");
        if (qrBlock) {
          const qrRect = qrBlock.getBoundingClientRect();
          const scaleX = renderWidth / elRect.width;
          const scaleY = renderHeight / elRect.height;
          const linkX = margin + (qrRect.left - elRect.left) * scaleX;
          const linkY = margin + (qrRect.top - elRect.top) * scaleY;
          const linkW = qrRect.width * scaleX;
          const linkH = qrRect.height * scaleY;
          pdf.link(linkX, linkY, linkW, linkH, { url: upiLink });
        }
      }

      pdf.save(`invoice-${invoiceNumber.replace(/\//g, "-")}.pdf`);
    } catch (err) {
      console.error("Invoice PDF generation failed:", err);
      setError("Could not generate PDF. Try Print instead.");
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
        {isGenerating ? "Preparing…" : "Download PDF"}
      </button>
      {error && <p className="text-xs text-credit">{error}</p>}
    </div>
  );
}
