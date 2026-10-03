"use client";

import { useState } from "react";

const RATES = [0, 3, 5, 18, 40];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Add GST to a price or take it out of a GST-inclusive price, with the CGST + SGST or IGST split. */
export function GstCalculator() {
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState(18);
  const [custom, setCustom] = useState("");
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [supply, setSupply] = useState<"intra" | "inter">("intra");

  const value = Math.max(0, Number(amount.replace(/,/g, "")) || 0);
  const r = custom !== "" ? Math.max(0, Number(custom) || 0) : rate;
  const base = mode === "add" ? value : value / (1 + r / 100);
  const gst = round2(mode === "add" ? (value * r) / 100 : value - base);
  const total = round2(mode === "add" ? value + gst : value);
  const half = round2(gst / 2);

  const pill = (active: boolean) => `rounded-full px-3.5 py-2 text-sm font-medium ${active ? "bg-white text-[#150f33]" : "border border-white/15 text-white/75"}`;
  const row = "flex items-center justify-between border-b border-white/10 py-2.5 text-sm last:border-b-0";

  return (
    <div className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">Amount (₹)</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg font-semibold text-white outline-none focus:border-white/40"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">The amount is</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("add")} className={pill(mode === "add")}>
              Before GST (add GST)
            </button>
            <button type="button" onClick={() => setMode("remove")} className={pill(mode === "remove")}>
              Including GST (remove GST)
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">GST rate</span>
          <div className="flex flex-wrap gap-2">
            {RATES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => {
                  setRate(x);
                  setCustom("");
                }}
                className={pill(custom === "" && rate === x)}
              >
                {x}%
              </button>
            ))}
            <input
              inputMode="decimal"
              placeholder="Other %"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-24 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-sm text-white outline-none placeholder:text-white/40"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">Buyer is in</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSupply("intra")} className={pill(supply === "intra")}>
              Same state (CGST + SGST)
            </button>
            <button type="button" onClick={() => setSupply("inter")} className={pill(supply === "inter")}>
              Other state (IGST)
            </button>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-white/[0.06] p-4" aria-live="polite">
        <div className={row}>
          <span className="text-white/65">Amount before GST</span>
          <span className="font-semibold">{rupees(round2(base))}</span>
        </div>
        {supply === "intra" ? (
          <>
            <div className={row}>
              <span className="text-white/65">CGST ({r / 2}%)</span>
              <span>{rupees(half)}</span>
            </div>
            <div className={row}>
              <span className="text-white/65">SGST ({r / 2}%)</span>
              <span>{rupees(round2(gst - half))}</span>
            </div>
          </>
        ) : (
          <div className={row}>
            <span className="text-white/65">IGST ({r}%)</span>
            <span>{rupees(gst)}</span>
          </div>
        )}
        <div className={row}>
          <span className="text-white/65">Total GST</span>
          <span className="font-semibold">{rupees(gst)}</span>
        </div>
        <div className={`${row} text-base`}>
          <span className="font-semibold">Total amount</span>
          <span className="text-xl font-bold">{rupees(total)}</span>
        </div>
      </div>
    </div>
  );
}
