"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";

type Label = { code: string; sampleName: string; tests: string[] };

export function LabLabelsClient({
  orderId,
  patient,
  when,
  labels,
  words,
}: {
  orderId: string;
  patient: string;
  when: string;
  labels: Label[];
  words: { title: string; hint: string; roll: string; a4: string; copies: string; print: string; back: string; none: string };
}) {
  const [size, setSize] = useState<"roll" | "a4">("roll");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const count = (code: string) => copies[code] ?? 1;
  const stickers = labels.flatMap((l) => Array.from({ length: count(l.code) }, (_, i) => ({ ...l, key: `${l.code}#${i}` })));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 bg-white p-4 text-black">
      <div className="no-print flex flex-col gap-3">
        <Link href={`/lab/orders/${orderId}`} className="text-sm text-gray-600">
          {words.back}
        </Link>
        <div>
          <p className="text-lg font-semibold">{words.title}</p>
          <p className="text-xs text-gray-500">{words.hint}</p>
        </div>
        <div className="flex gap-2">
          {(["roll", "a4"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setSize(k)} className={`rounded-full border px-3 py-1 text-xs font-medium ${size === k ? "border-teal-700 bg-teal-50 text-teal-800" : "border-gray-300 text-gray-600"}`}>
              {k === "roll" ? words.roll : words.a4}
            </button>
          ))}
        </div>
        {labels.map((l) => (
          <div key={l.code} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <b>{l.sampleName}</b> · {l.tests.join(", ")}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-gray-500">{words.copies}</span>
              <button type="button" onClick={() => setCopies((c) => ({ ...c, [l.code]: Math.max(0, count(l.code) - 1) }))} className="h-7 w-7 rounded-full border border-gray-300" aria-label="−">
                −
              </button>
              <span className="w-5 text-center">{count(l.code)}</span>
              <button type="button" onClick={() => setCopies((c) => ({ ...c, [l.code]: Math.min(9, count(l.code) + 1) }))} className="h-7 w-7 rounded-full border border-gray-300" aria-label="+">
                +
              </button>
            </span>
          </div>
        ))}
        {labels.length === 0 ? (
          <p className="text-sm text-gray-500">{words.none}</p>
        ) : (
          <button type="button" onClick={() => window.print()} className="flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
            <Printer size={15} /> {words.print}
          </button>
        )}
      </div>

      <div className={size === "a4" ? "grid grid-cols-3 gap-1" : "flex flex-col items-center gap-2"}>
        {stickers.map((s) => (
          <Sticker key={s.key} code={s.code} patient={patient} sample={s.sampleName} tests={s.tests} when={when} size={size} />
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: ${size === "roll" ? "50mm 25mm" : "A4"}; margin: ${size === "roll" ? "0" : "8mm"}; }
          body { background: #fff; }
          ${size === "roll" ? ".lab-sticker { page-break-after: always; border: none !important; }" : ""}
        }
      `}</style>
    </div>
  );
}

function Sticker({ code, patient, sample, tests, when, size }: { code: string; patient: string; sample: string; tests: string[]; when: string; size: "roll" | "a4" }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (svgRef.current) JsBarcode(svgRef.current, code, { format: "CODE128", width: 1.1, height: 26, displayValue: false, margin: 0 });
    });
  }, [code]);
  return (
    <div
      className="lab-sticker flex flex-col justify-between overflow-hidden border border-dashed border-gray-300 bg-white text-black"
      style={{ width: size === "roll" ? "50mm" : "62mm", height: size === "roll" ? "25mm" : "30mm", padding: "1.2mm 1.8mm", pageBreakInside: "avoid" }}
    >
      <div className="flex items-baseline justify-between gap-1 leading-tight">
        <span className="truncate text-[9px] font-bold">{patient}</span>
        <span className="shrink-0 text-[8px] font-semibold uppercase">{sample}</span>
      </div>
      <svg ref={svgRef} className="h-[9mm] w-full" />
      <div className="flex items-baseline justify-between gap-1 leading-tight">
        <span className="shrink-0 font-mono text-[8px]">{code}</span>
        <span className="shrink-0 text-[7px]">{when}</span>
      </div>
      <p className="truncate text-[7px] leading-tight">{tests.join(", ")}</p>
    </div>
  );
}
