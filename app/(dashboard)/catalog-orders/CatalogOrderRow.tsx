"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { acceptCatalogOrderAction, rejectCatalogOrderAction } from "@/lib/actions/catalog";
import { formatMoney } from "@/lib/format";

type Request = {
  id: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  status: "pending" | "accepted" | "rejected";
  billId: string | null;
  createdAt: string;
  items: { productName: string; quantity: number; price: number }[];
};

export function CatalogOrderRow({ request, businessType }: { request: Request; businessType: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [showKotAsk, setShowKotAsk] = useState(false);
  const [kotItems, setKotItems] = useState<{ productName: string; quantity: number }[] | null>(null);

  function doAccept(sendToKot: boolean) {
    setShowKotAsk(false);
    startTransition(async () => {
      const result = await acceptCatalogOrderAction(request.id, paymentMethod, sendToKot);
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
