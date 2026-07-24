import "server-only";
import QRCode from "qrcode";

export function buildUpiLink(upiId: string, payeeName: string, amount: number, note: string) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

/** Renders a UPI payment link as a PNG data URL — server-side, so it prints
 * reliably as a static image rather than depending on client-side canvas
 * rendering (which can behave inconsistently in browser print dialogs). */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 220, color: { dark: "#1a1d1e", light: "#ffffff" } });
}
