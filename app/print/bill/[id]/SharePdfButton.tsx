"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { invoicePdfName, makeInvoicePdf } from "@/lib/print/invoicePdf";

/** Sends the invoice as a real PDF file through the phone's share sheet — WhatsApp, then the
 * customer's chat. (No app lets a website pre-pick the chat for a file; the text button does
 * go straight to the customer's number, with a link to this same PDF.) */
export function SharePdfButton({
  invoiceNumber,
  shopName,
  upiLink,
  isThermal,
}: {
  invoiceNumber: string;
  shopName: string;
  upiLink?: string | null;
  isThermal: boolean;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Kept once made: a browser only opens the share sheet within a few seconds of a tap, and
  // making the PDF can take longer on a slow phone — then the next tap shares it at once.
  const [file, setFile] = useState<File | null>(null);

  async function share() {
    setNote(null);
    setBusy(true);
    let pdfFile = file;
    try {
      if (!pdfFile) {
        const pdf = await makeInvoicePdf({ isThermal, upiLink });
        pdfFile = new File([pdf.output("blob")], invoicePdfName(invoiceNumber), { type: "application/pdf" });
        setFile(pdfFile);
      }
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))) {
        await navigator.share({ files: [pdfFile], title: `Invoice ${invoiceNumber}`, text: `Invoice ${invoiceNumber} from ${shopName}` });
      } else {
        // A desktop browser without file sharing: save it, to attach by hand.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pdfFile);
        a.download = pdfFile.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        setNote(t("PDF saved — attach it in the customer's WhatsApp chat."));
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "AbortError") {
        // Closing the share sheet without picking an app is not an error.
      } else if (name === "NotAllowedError" && pdfFile) {
        setNote(t("PDF is ready — tap Send PDF."));
      } else {
        console.error("Sharing the invoice PDF failed:", err);
        setNote(t("Could not share the PDF. Use Save PDF instead."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <button onClick={share} disabled={busy} className="bill-action">
        <Share2 size={15} />
        {busy ? t("billPage.preparing") : file ? t("Send PDF") : t("Share PDF")}
      </button>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
