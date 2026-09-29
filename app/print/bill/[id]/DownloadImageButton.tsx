"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { invoicePdfName, makeInvoicePdf } from "@/lib/print/invoicePdf";

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
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setIsGenerating(true);
    try {
      const pdf = await makeInvoicePdf({ isThermal, upiLink });
      pdf.save(invoicePdfName(invoiceNumber));
    } catch (err) {
      console.error("Invoice PDF generation failed:", err);
      setError("Could not generate PDF. Try Print instead.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <button onClick={handleDownload} disabled={isGenerating} className="bill-action">
        <FileDown size={15} />
        {isGenerating ? t("billPage.preparing") : t("billPage.savePdf")}
      </button>
      {error && <p className="text-xs text-credit">{error}</p>}
    </div>
  );
}
