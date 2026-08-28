"use client";

import dynamic from "next/dynamic";

export const SalesTrendChartLazy = dynamic(
  () => import("./SalesTrendChart").then((m) => ({ default: m.SalesTrendChart })),
  { ssr: false, loading: () => <div className="h-28 animate-pulse rounded-xl bg-surface" /> },
);

export const MiniCalendarLazy = dynamic(
  () => import("./MiniCalendar").then((m) => ({ default: m.MiniCalendar })),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-xl bg-surface" /> },
);
