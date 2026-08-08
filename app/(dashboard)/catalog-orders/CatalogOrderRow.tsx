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

export function CatalogOrderRow({ request }: { request: Request }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");

  const total = request.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <li className="rounded-xl border border-border bg-surface shadow-sm p-3.5">
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
            onClick={() =>
              startTransition(async () => {
                const result = await acceptCatalogOrderAction(request.id, paymentMethod);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              })
            }
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
    </li>
  );
}
