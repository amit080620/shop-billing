"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { acceptCatalogOrderAction, rejectCatalogOrderAction, setDeliveryStatusAction } from "@/lib/actions/catalog";
import { formatMoney } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { MessageCircle, Package, Truck, CheckCircle2 } from "lucide-react";

type Request = {
  id: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  status: "pending" | "accepted" | "rejected";
  billId: string | null;
  wantsDelivery: boolean;
  deliveryStatus: "ready" | "dispatched" | "completed" | null;
  createdAt: string;
  items: { productName: string; quantity: number; price: number }[];
};

export function CatalogOrderRow({
  request,
  businessType,
  shopUpiId,
  shopName,
}: {
  request: Request;
  businessType: string;
  shopUpiId: string | null;
  shopName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [showKotAsk, setShowKotAsk] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [kotItems, setKotItems] = useState<{ productName: string; quantity: number }[] | null>(null);

  function doAccept(sendToKot: boolean) {
    setShowKotAsk(false);
    startTransition(async () => {
      const result = await acceptCatalogOrderAction(request.id, paymentMethod, sendToKot, alreadyPaid);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (sendToKot) {
        // A real kitchen ticket now exists — also show a printable KOT
        // right away so the kitchen has a paper copy, same as any
        // dine-in order.
        setKotItems(request.items.map((i) => ({ productName: i.productName, quantity: i.quantity })));
        setTimeout(() => window.print(), 150);
      }
      router.refresh();
    });
  }

  const total = request.items.reduce((s, i) => s + i.price * i.quantity, 0);

  function sendPaymentLink() {
    if (!shopUpiId) {
      setError("Add your shop's UPI ID in Settings first, so payment links can be sent.");
      return;
    }
    const upiLink = `upi://pay?pa=${encodeURIComponent(shopUpiId)}&pn=${encodeURIComponent(shopName)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order for ${request.customerName}`)}`;
    const message = [
      `Hi ${request.customerName}, thank you for your order at ${shopName}!`,
      `Kindly pay ₹${total.toFixed(2)} to confirm this order:`,
      upiLink,
      `Once we receive the payment, we'll start preparing your order right away.`,
    ].join("\n\n");
    window.open(buildWhatsAppLink(request.customerPhone, message), "_blank");
  }

  return (
    <li className="neu-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{request.customerName}</p>
          <p className="text-xs text-muted">{request.customerPhone}</p>
          {request.notes && <p className="text-xs text-muted">{request.notes}</p>}
        </div>
        <p className="shrink-0 text-sm font-semibold text-foreground">{formatMoney(total)}</p>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {request.items.map((item, i) => (
          <li key={i} className="flex justify-between text-xs text-muted">
            <span>{item.productName} × {item.quantity}</span>
            <span>{formatMoney(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {request.status === "pending" && (
        <button
          onClick={sendPaymentLink}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-success"
        >
          <MessageCircle size={13} /> Send payment link (WhatsApp)
        </button>
      )}

      {request.status === "pending" && (
        <label className="mt-2 flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2">
          <input
            type="checkbox"
            checked={alreadyPaid}
            onChange={(e) => setAlreadyPaid(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
          />
          <span className="text-xs">
            <span className="font-medium text-foreground">Customer has already paid</span>
            <span className="block text-muted">
              Tick this if they paid the UPI link you sent. Leave it unticked to collect on delivery.
            </span>
          </span>
        </label>
      )}

      {request.status === "pending" && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
          <button
            onClick={() => {
              if (businessType === "restaurant") {
                setShowKotAsk(true);
                return;
              }
              doAccept(false);
            }}
            disabled={isPending}
            className="btn-primary-sm disabled:opacity-60"
          >
            {isPending ? "Working…" : "Accept & bill"}
          </button>
          <button
            onClick={() => {
              if (!confirm("Reject this order?")) return;
              startTransition(async () => {
                await rejectCatalogOrderAction(request.id);
                router.refresh();
              });
            }}
            disabled={isPending}
            className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {request.status === "accepted" && request.billId && (
        <Link href={`/print/bill/${request.billId}`} className="mt-2 inline-block text-xs font-medium text-brand">
          View bill →
        </Link>
      )}

      {request.status === "accepted" && request.wantsDelivery && request.deliveryStatus !== "completed" && (
        <div className="mt-2 flex items-center gap-2">
          <p className="text-xs text-muted">Delivery:</p>
          {(["ready", "dispatched", "completed"] as const).map((s) => {
            const Icon = s === "ready" ? Package : s === "dispatched" ? Truck : CheckCircle2;
            const isActive = request.deliveryStatus === s;
            const isPast =
              (s === "ready" && (request.deliveryStatus === "dispatched" || request.deliveryStatus === "completed")) ||
              (s === "dispatched" && request.deliveryStatus === "completed");
            return (
              <button
                key={s}
                onClick={() => {
                  startTransition(async () => {
                    await setDeliveryStatusAction(request.id, s);
                    router.refresh();
                  });
                }}
                disabled={isPending}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize disabled:opacity-60 ${
                  isActive || isPast ? "bg-brand text-white" : "border border-border text-muted"
                }`}
              >
                <Icon size={11} /> {s}
              </button>
            );
          })}
        </div>
      )}

      {kotItems && (
        <div id="kot-print" className="hidden-on-screen">
          <p className="kot-title">KITCHEN ORDER — ONLINE</p>
          <p className="kot-sub">{request.customerName} · {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
          <hr />
          {kotItems.map((item, i) => (
            <p key={i} className="kot-item">{item.quantity} × {item.productName}</p>
          ))}
        </div>
      )}
      <style jsx>{`
        @media screen {
          .hidden-on-screen {
            display: none;
          }
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #kot-print,
          #kot-print * {
            visibility: visible;
          }
          #kot-print {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            padding: 8px;
            color: #000;
            background: #fff;
          }
          .kot-title {
            font-size: 15px;
            font-weight: 700;
            text-align: center;
          }
          .kot-sub {
            font-size: 11px;
            text-align: center;
            margin-bottom: 4px;
          }
          .kot-item {
            font-size: 13px;
            margin: 4px 0;
          }
        }
      `}</style>

      {showKotAsk && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowKotAsk(false)}>
          <div className="ray-pop w-full max-w-xs rounded-2xl bg-surface p-5" style={{ boxShadow: "var(--elevation-4)" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">Send to kitchen?</p>
            <p className="mt-1 text-xs text-muted">
              This creates a real kitchen ticket on the KDS screen for {request.customerName}&apos;s order — the cook
              marks it ready like any table order.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => doAccept(true)} disabled={isPending} className="btn-primary w-full text-center disabled:opacity-60">
                {isPending ? "Working…" : "Yes — send to kitchen"}
              </button>
              <button
                onClick={() => doAccept(false)}
                disabled={isPending}
                className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
              >
                No — just bill it
              </button>
              <button onClick={() => setShowKotAsk(false)} className="w-full text-center text-xs text-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
