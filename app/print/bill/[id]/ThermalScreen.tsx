"use client";

import { useEffect, useState, type ReactNode } from "react";
import { buildReceiptEscPos, type ReceiptData, type ReceiptFormatSettings } from "@/lib/escpos";
import { shouldDefaultToBluetooth } from "@/lib/bluetooth-print";
import { helperSettings } from "@/lib/printHelper";

type Line = { text: string; align: "left" | "center" | "right"; bold: boolean };

/** The lines a receipt printer prints from these ESC/POS bytes, with each line's alignment and
 * bold — read from the very bytes sent to the printer, so the screen can't drift from the paper. */
export function escPosLines(bytes: Uint8Array): Line[] {
  const lines: Line[] = [];
  let align: Line["align"] = "left";
  let bold = false;
  let text = "";
  let lineBold = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const cmd = bytes[i + 1];
      if (cmd === 0x40) {
        align = "left";
        bold = false;
        i += 1;
      } else if (cmd === 0x61) {
        const n = bytes[i + 2];
        align = n === 1 ? "center" : n === 2 ? "right" : "left";
        i += 2;
      } else if (cmd === 0x45) {
        bold = bytes[i + 2] === 1;
        i += 2;
      } else i += 2; // other two-byte settings (underline …)
      continue;
    }
    if (b === 0x1d) {
      if (bytes[i + 1] === 0x56) break; // cut: the receipt ends here
      i += 2;
      continue;
    }
    if (b === 0x0a) {
      lines.push({ text, align, bold: lineBold });
      text = "";
      lineBold = false;
      continue;
    }
    // A line is bold when its text was printed bold.
    if (bold && b !== 0x20) lineBold = true;
    text += String.fromCharCode(b);
  }
  while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop(); // the paper feed before the cut
  return lines;
}

/** On a phone that prints by Bluetooth (the app, or Chrome on Android) — or a computer printing
 * through the Print Helper — Print sends the ESC/POS receipt, so that is what the screen shows,
 * line for line. The designed receipt stays on the page, out of sight, for Save PDF and Share. */
export function ThermalScreen({ receipt, chars, format, children }: { receipt: ReceiptData; chars: 32 | 48; format?: ReceiptFormatSettings; children: ReactNode }) {
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    if (shouldDefaultToBluetooth() || helperSettings().enabled) setLines(escPosLines(buildReceiptEscPos(receipt, chars, format)));
  }, [receipt, chars, format]);

  if (!lines) return <>{children}</>;
  return (
    <>
      <div className="flex justify-center px-2 py-3">
        <div
          aria-label="Receipt as it prints"
          className="bg-white text-black"
          style={{
            width: `calc(${chars}ch + 16px)`,
            maxWidth: "100%",
            padding: "10px 8px 14px",
            fontFamily: 'ui-monospace, "Roboto Mono", "SFMono-Regular", Menlo, Consolas, monospace',
            fontSize: chars === 32 ? "12.5px" : "10px",
            lineHeight: 1.35,
            boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
            borderRadius: 4,
            overflowX: "auto",
          }}
        >
          {lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre", textAlign: l.align, fontWeight: l.bold ? 700 : 400, minHeight: "1.35em" }}>
              {l.text}
            </div>
          ))}
        </div>
      </div>
      {/* Kept rendered (not hidden) so Save PDF / Share can still draw it. */}
      <div aria-hidden style={{ position: "absolute", left: -10000, top: 0 }}>
        {children}
      </div>
    </>
  );
}
