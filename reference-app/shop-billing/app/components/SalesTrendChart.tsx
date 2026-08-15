"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export function SalesTrendChart({ data }: { data: { day: string; total: number }[] }) {
  const hasAnySales = data.some((d) => d.total > 0);

  if (!hasAnySales) {
    return (
      <div className="flex h-28 w-full flex-col items-center justify-center gap-1 text-center">
        <p className="text-xs text-muted">No sales in this period yet</p>
        <p className="text-[11px] text-muted/70">Your first bill will show up here</p>
      </div>
    );
  }

  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--brand-soft)" }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
            formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Sales"]}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--brand)" maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
