"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Ticket = {
  id: string;
  orderNumber: string;
  tableName: string;
  createdAt: string;
  items: { id: string; name: string; quantity: number; createdAt: string }[];
};

export function KdsClient({ shopName, initialTickets }: { shopName: string; initialTickets: Ticket[] }) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());

  // Auto-refresh: pulls fresh data from the server every 8s (new orders,
  // new items, tables that just settled disappear) — simple polling
  // rather than a realtime subscription, which is plenty responsive for a
  // kitchen screen and far more robust to build and keep working.
  useEffect(() => {
    const dataTimer = setInterval(() => router.refresh(), 8000);
    const clockTimer = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{shopName} · Kitchen</h1>
          <p className="text-sm text-gray-400">{initialTickets.length} order(s) in progress</p>
        </div>
        <a href="/restaurant" className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300">
          ← Back to app
        </a>
      </div>

      {initialTickets.length === 0 ? (
        <div className="flex h-[70vh] items-center justify-center text-2xl font-medium text-gray-600">
          No open orders — kitchen&apos;s clear ✨
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {initialTickets.map((ticket) => {
            const age = Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000);
            const tone =
              age >= 20
                ? "border-red-500 bg-red-950/40"
                : age >= 10
                  ? "border-amber-500 bg-amber-950/30"
                  : "border-emerald-600 bg-emerald-950/20";
            return (
              <div key={ticket.id} className={`flex flex-col gap-2 rounded-2xl border-2 p-4 ${tone}`}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">{ticket.tableName}</p>
                  <span className="text-sm font-semibold text-gray-300">{age}m</span>
                </div>
                <p className="text-xs text-gray-400">#{ticket.orderNumber}</p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {ticket.items.map((item) => (
                    <li key={item.id} className="flex items-baseline justify-between text-base">
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-2 shrink-0 text-lg font-bold">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
