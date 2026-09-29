// Browser-only: turns the invoice on screen (#invoice-capture-area) into a PDF.

// 1 CSS px = 0.264583mm at the standard 96dpi reference used by browsers.
const PX_TO_MM = 0.264583;

export function invoicePdfName(invoiceNumber: string) {
  return `invoice-${invoiceNumber.replace(/\//g, "-")}.pdf`;
}

export async function makeInvoicePdf({ isThermal, upiLink }: { isThermal: boolean; upiLink?: string | null }) {
  const element = document.getElementById("invoice-capture-area");
  if (!element) throw new Error("Could not find invoice content");

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const scale = 2; // sharper image than 1:1 capture
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale, useCORS: true });
  // JPEG, not PNG: the same sharp text at a tenth of the size — a PNG invoice came to ~5 MB,
  // too heavy to send a customer on WhatsApp.
  const imgData = canvas.toDataURL("image/jpeg", 0.88);

  const elRect = element.getBoundingClientRect();
  const contentWidthMm = elRect.width * PX_TO_MM;
  const contentHeightMm = elRect.height * PX_TO_MM;

  // Full page uses A4's standard width (210mm) so it looks like a normal
  // document; thermal uses a narrow 80mm receipt width. Either way the
  // page HEIGHT is sized to fit the actual content — a fixed 297mm (A4)
  // height was cutting off anything past one page's worth of items,
  // which silently cut off the QR/link section below it too.
  const margin = isThermal ? 0 : 10;
  const pageWidthMm = isThermal ? 80 : 210;
  const renderWidth = pageWidthMm - margin * 2;
  const renderHeight = (contentHeightMm / contentWidthMm) * renderWidth;
  const pageHeightMm = renderHeight + margin * 2;

  const pdf = new jsPDF({ unit: "mm", format: [pageWidthMm, pageHeightMm], orientation: "portrait" });
  pdf.addImage(imgData, "JPEG", margin, margin, renderWidth, renderHeight);

  // Make the UPI QR area a real tappable link in the PDF, positioned by
  // measuring the actual QR block element rather than guessing coordinates
  // — stays correct regardless of how long the item list is.
  if (upiLink) {
    const qrBlock = element.querySelector("#upi-qr-block");
    if (qrBlock) {
      const qrRect = qrBlock.getBoundingClientRect();
      const scaleX = renderWidth / elRect.width;
      const scaleY = renderHeight / elRect.height;
      pdf.link(margin + (qrRect.left - elRect.left) * scaleX, margin + (qrRect.top - elRect.top) * scaleY, qrRect.width * scaleX, qrRect.height * scaleY, { url: upiLink });
    }
  }
  return pdf;
}
