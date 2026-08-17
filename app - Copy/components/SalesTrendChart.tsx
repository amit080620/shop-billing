"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useRouter } from "next/navigation";

export function SalesTrendChart({ data }: { data: { day: string; date: string; total: number }[] }) {
  const router = useRouter();
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
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-light)" />
              <stop offset="100%" stopColor="var(--brand-dark)" />
            </linearGradient>
            <filter id="barShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="var(--neu-dark)" floodOpacity="0.7" />
            </filter>
          </defs>
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
          <Bar
            dataKey="total"
            radius={[6, 6, 6, 6]}
            fill="url(#barGradient)"
            style={{ filter: "url(#barShadow)", cursor: "pointer" }}
            maxBarSize={22}
            onClick={(entry) => {
              const date = (entry as unknown as { date?: string })?.date;
              if (date) router.push(`/daily-summary?date=${date}`);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
