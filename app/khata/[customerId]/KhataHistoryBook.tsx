"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";

export type KhataEntry =
  | {
      kind: "bill";
      id: string;
      invoiceNumber: string;
      createdAt: string;
      status: "active" | "voided";
      total: number;
      paidAmount: number;
      creditAmount: number;
      paymentMethod: string;
      balanceAfter: number;
      items: { name: string; quantity: number; lineTotal: number }[];
    }
  | {
      kind: "payment";
      id: string;
      createdAt: string;
      amount: number;
      paymentMethod: string;
      note: string | null;
      balanceAfter: number;
    };

const PAGE_SIZE = 5;
const FLIP_MS = 380;

/** Once the history grows past a screenful, a single long scroll
 * stops feeling like an "account book" and starts feeling like an
 * endless feed. This genuinely paginates it like a real accounting
 * register — a fixed number of entries per page, with a real page-
 * turn animation (a CSS 3D rotateY flip on the page's own spine, the
 * content swapped at the exact moment the page is edge-on and
 * invisible) instead of a plain instant swap or a scroll-jump. */
export function KhataHistoryBook({ entries }: { entries: KhataEntry[] }) {
  const [page, setPage] = useState(0);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function goTo(nextPage: number, direction: "next" | "prev") {
    if (nextPage < 0 || nextPage >= pageCount || flipDirection) return;
    setFlipDirection(direction);
    // Swap the actual page content exactly at the animation's
    // midpoint — the moment the page is rotated fully edge-on and
    // genuinely invisible — so the flip always reveals the NEW page
    // as it rotates back into view, matching how a real page turn
    // works rather than swapping content on an already-visible page.
    window.setTimeout(() => setPage(nextPage), FLIP_MS / 2);
    window.setTimeout(() => setFlipDirection(null), FLIP_MS);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">Full account history</p>
        <p className="text-[11px] text-muted">Balance after each entry →</p>
      </div>

      <div style={{ perspective: "1600px" }}>
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No transactions yet.</p>
        ) : (
          <ul
            key={page}
            className={flipDirection === "next" ? "animate-khata-flip-next" : flipDirection === "prev" ? "animate-khata-flip-prev" : ""}
            style={{ transformOrigin: "left center", transformStyle: "preserve-3d" }}
          >
            {current.map((entry) =>
              entry.kind === "bill" ? (
                <li key={`bill-${entry.id}`} className="flex flex-col gap-2 border-b border-border/60 py-2 first:pt-0 last:border-0 last:pb-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <p className={`flex items-center gap-1 truncate text-sm font-medium text-foreground ${entry.status === "voided" ? "line-through opacity-60" : ""}`}>
                          Bill {entry.invoiceNumber}
                          {entry.items.length > 0 && (
                            <ChevronDown size={13} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDateTime(entry.createdAt)}
                          {entry.paidAmount === 0
                            ? " · Fully on udhar"
                            : entry.creditAmount > 0
                              ? ` · ${formatMoney(entry.paidAmount)} paid via ${entry.paymentMethod.toUpperCase()}`
                              : ` · Paid via ${entry.paymentMethod.toUpperCase()}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {entry.status === "voided" ? (
                          <p className="text-xs font-medium text-danger">Voided</p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">{formatMoney(entry.total)}</p>
                            {entry.creditAmount > 0 && <p className="text-[11px] text-credit">{formatMoney(entry.creditAmount)} on udhar</p>}
                            <p className="text-[10px] text-muted">Bal: {formatMoney(entry.balanceAfter)}</p>
                          </>
                        )}
                      </div>
                    </summary>
                    {entry.items.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-background px-3 py-2">
                        {entry.items.map((item, i) => (
                          <li key={i} className="flex justify-between text-xs text-muted">
                            <span className="truncate">
                              {item.quantity} × {item.name}
                            </span>
                            <span className="shrink-0 pl-2 text-foreground">{formatMoney(item.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              ) : (
                <li key={`pay-${entry.id}`} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 first:pt-0 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-success">Udhar payment received</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(entry.createdAt)} · via {entry.paymentMethod.toUpperCase()}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-success">− {formatMoney(entry.amount)}</p>
                    <p className="text-[10px] text-muted">Bal: {formatMoney(entry.balanceAfter)}</p>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
          <button
            onClick={() => goTo(page - 1, "prev")}
            disabled={page === 0}
            className="flex items-center gap-1 text-xs font-medium text-brand disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Previous page
          </button>
          <p className="text-[11px] text-muted">
            Page {page + 1} of {pageCount}
          </p>
          <button
            onClick={() => goTo(page + 1, "next")}
            disabled={page === pageCount - 1}
            className="flex items-center gap-1 text-xs font-medium text-brand disabled:opacity-30"
          >
            Next page <ChevronRight size={14} />
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes khata-flip-next {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(-96deg);
          }
          51% {
            transform: rotateY(96deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }
        @keyframes khata-flip-prev {
          0% {
            transform: rotateY(0deg);
          }
          50% {
            transform: rotateY(96deg);
          }
          51% {
            transform: rotateY(-96deg);
          }
          100% {
            transform: rotateY(0deg);
          }
        }
        .animate-khata-flip-next {
          animation: khata-flip-next ${FLIP_MS}ms ease-in-out;
        }
        .animate-khata-flip-prev {
          animation: khata-flip-prev ${FLIP_MS}ms ease-in-out;
        }
      `}</style>
    </div>
  );
}
