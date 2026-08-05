"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

export function SalesTrendChart({ data }: { data: { day: string; total: number }[] }) {
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
