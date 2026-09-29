// Browser-only: turns the invoice on screen (#invoice-capture-area) into a PDF.

export function invoicePdfName(invoiceNumber: string) {
  return `invoice-${invoiceNumber.replace(/\//g, "-")}.pdf`;
}

type Box = { x: number; y: number; width: number; height: number };

export async function makeInvoicePdf({ isThermal, upiLink }: { isThermal: boolean; upiLink?: string | null }) {
  const element = document.getElementById("invoice-capture-area");
  if (!element) throw new Error("Could not find invoice content");

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  // An A4 invoice is laid out at A4 width (210mm at 96dpi) whatever the screen — made on a
  // phone it would otherwise come out as a long, narrow strip. Only the copy html2canvas draws
  // is resized; the invoice on screen does not move.
  const A4_WIDTH_PX = 794;
  let captured: Box | null = null;
  let qrBox: Box | null = null;

  const scale = 2; // sharper image than 1:1 capture
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
    ...(isThermal ? {} : { windowWidth: 1024 }),
    onclone: (doc) => {
      const copy = doc.getElementById("invoice-capture-area");
      if (!copy) return;
      // Room under the last line, which otherwise lost its bottom pixels to the edge.
      copy.style.paddingBottom = "12px";
      if (!isThermal) {
        copy.style.width = `${A4_WIDTH_PX}px`;
        copy.style.maxWidth = "none";
      }
      const r = copy.getBoundingClientRect();
      captured = { x: r.left, y: r.top, width: r.width, height: r.height };
      // Where the UPI QR sits, to make it a tappable link in the PDF.
      const qr = copy.querySelector("#upi-qr-block")?.getBoundingClientRect();
      if (qr) qrBox = { x: qr.left - r.left, y: qr.top - r.top, width: qr.width, height: qr.height };
    },
  });
  // JPEG, not PNG: the same sharp text at a tenth of the size — a PNG invoice came to ~5 MB,
  // too heavy to send a customer on WhatsApp.
  const imgData = canvas.toDataURL("image/jpeg", 0.88);

  // Full page uses the standard A4 width (210mm) so it looks like a normal
  // document; thermal uses a narrow 80mm receipt width. Either way the
  // page HEIGHT is sized to fit the actual content — a fixed 297mm (A4)
  // height was cutting off anything past one page's worth of items,
  // which silently cut off the QR/link section below it too.
  const margin = isThermal ? 0 : 10;
  const pageWidthMm = isThermal ? 80 : 210;
  const renderWidth = pageWidthMm - margin * 2;
  const renderHeight = (canvas.height / canvas.width) * renderWidth;
  const pageHeightMm = renderHeight + margin * 2;

  const pdf = new jsPDF({ unit: "mm", format: [pageWidthMm, pageHeightMm], orientation: "portrait" });
  pdf.addImage(imgData, "JPEG", margin, margin, renderWidth, renderHeight);

  const area = captured as Box | null;
  const qr = qrBox as Box | null;
  if (upiLink && area && qr && area.width > 0) {
    const k = renderWidth / area.width;
    pdf.link(margin + qr.x * k, margin + qr.y * k, qr.width * k, qr.height * k, { url: upiLink });
  }
  return pdf;
}
