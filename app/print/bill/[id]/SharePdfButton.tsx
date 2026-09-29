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

  async function share() {
    setNote(null);
    setBusy(true);
    try {
      const pdf = await makeInvoicePdf({ isThermal, upiLink });
      const file = new File([pdf.output("blob")], invoicePdfName(invoiceNumber), { type: "application/pdf" });
      const data = { files: [file], title: `Invoice ${invoiceNumber}`, text: `Invoice ${invoiceNumber} from ${shopName}` };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share(data);
      } else {
        // A desktop browser without file sharing: save it, to attach by hand.
        pdf.save(invoicePdfName(invoiceNumber));
        setNote(t("PDF saved — attach it in the customer's WhatsApp chat."));
      }
    } catch (err) {
      // Closing the share sheet without picking an app is not an error.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
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
        {busy ? t("billPage.preparing") : t("Share PDF")}
      </button>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
