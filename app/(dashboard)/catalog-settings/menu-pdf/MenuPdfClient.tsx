"use client";

import { useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { getMenuForPdfAction } from "@/lib/actions/menu-pdf";
import { jsPDF } from "jspdf";
import { FileText, Download } from "lucide-react";

export function MenuPdfClient() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);

  async function generate() {
    setError(null);
    setIsPending(true);
    const result = await getMenuForPdfAction();
    setIsPending(false);

    if (result.error || !result.categories) {
      setError(result.error ?? "Could not load your menu");
      return;
    }
    if (result.categories.length === 0) {
      setError("No items are marked \"show in catalog\" yet — add some from Products first.");
      return;
    }

    const catalogUrl = result.publicToken
      ? `${window.location.origin}/shop/${result.publicToken}`
      : null;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 44;
    let y = 60;

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(result.shopName ?? "Menu", pageWidth / 2, y, { align: "center" });
    y += 22;

    if (catalogUrl) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(4, 39, 243);
      doc.textWithLink("Tap any item to order online →", pageWidth / 2, y, {
        url: catalogUrl,
        align: "center",
      });
      doc.setTextColor(0, 0, 0);
      y += 26;
    } else {
      y += 10;
    }

    for (const cat of result.categories) {
      if (y > pageHeight - 80) {
        doc.addPage();
        y = 60;
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(cat.category, marginX, y);
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 20;

      for (const item of cat.items) {
        if (y > pageHeight - 50) {
          doc.addPage();
          y = 60;
        }
        const priceText =
          item.offerPrice !== null ? `Rs ${item.offerPrice.toFixed(2)}` : `Rs ${item.price.toFixed(2)}`;

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        if (catalogUrl) {
          doc.setTextColor(4, 39, 243);
          doc.textWithLink(item.name, marginX, y, { url: catalogUrl });
          doc.setTextColor(0, 0, 0);
        } else {
          doc.text(item.name, marginX, y);
        }
        doc.text(priceText, pageWidth - marginX, y, { align: "right" });
        y += 20;
      }
      y += 10;
    }

    doc.save(`${(result.shopName ?? "menu").replace(/\s+/g, "_")}_menu.pdf`);
    setJustDone(true);
    setTimeout(() => setJustDone(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<FileText size={20} />} title="Menu PDF" subtitle="A shareable menu with clickable items that link to online ordering" />

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Generates a clean PDF from everything in your Products list marked <b>&quot;show in catalog&quot;</b>,
          grouped by category. Every item name is a live link — anyone reading the PDF (WhatsApp, print, email)
          can tap straight through to your online ordering page.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={generate}
        disabled={isPending}
        className={`btn-primary flex items-center justify-center gap-2 disabled:opacity-60 ${justDone ? "animate-save-success" : ""}`}
      >
        <Download size={16} />
        {isPending ? "Building your menu…" : justDone ? "Downloaded ✓" : "Generate & download PDF"}
      </button>
    </div>
  );
}
