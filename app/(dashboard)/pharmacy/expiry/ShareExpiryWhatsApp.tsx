"use client";

type Row = { name: string; batchNumber: string; quantity: number; unit: string; expiryDate: string; daysLeft: number };

export function ShareExpiryWhatsApp({ expired, critical, shopName }: { expired: Row[]; critical: Row[]; shopName: string }) {
  function share() {
    const lines: string[] = [`*${shopName} — Expiry alert*`, ""];

    if (expired.length > 0) {
      lines.push(`🔴 Already expired (${expired.length}):`);
      for (const r of expired.slice(0, 15)) {
        lines.push(`• ${r.name} (Batch ${r.batchNumber}) — ${r.quantity} ${r.unit}`);
      }
      lines.push("");
    }
    if (critical.length > 0) {
      lines.push(`🟠 Expiring within 30 days (${critical.length}):`);
      for (const r of critical.slice(0, 15)) {
        lines.push(`• ${r.name} (Batch ${r.batchNumber}) — ${r.quantity} ${r.unit}, ${r.daysLeft}d left`);
      }
    }
    lines.push("", "Sent from the shop billing app.");

    const message = lines.join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  if (expired.length === 0 && critical.length === 0) return null;

  return (
    <button
      onClick={share}
      className="rounded-lg border border-brand bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand-dark"
    >
      📤 Share urgent list via WhatsApp
    </button>
  );
}
