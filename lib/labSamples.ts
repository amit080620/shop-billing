// Sample labels for a lab order: one sticker per kind of sample (blood, urine…), each with a
// barcode "<order number>-<sample letter>" (e.g. "2026-27/LAB00012-B"). Scanning a sticker back
// finds the order. Pure, so the print page, the orders search and the tests agree.

export type SampleType = "blood" | "urine" | "stool" | "swab" | "other";

export const SAMPLE_LETTER: Record<SampleType, string> = { blood: "B", urine: "U", stool: "S", swab: "W", other: "O" };
export const SAMPLE_LABEL: Record<SampleType, string> = { blood: "Blood", urine: "Urine", stool: "Stool", swab: "Swab", other: "Other" };
const ORDER: SampleType[] = ["blood", "urine", "stool", "swab", "other"];

export type SampleLabel = { code: string; sampleType: SampleType; tests: string[] };

/** One label per kind of sample the order's tests need, blood first. A test with no known sample type counts as "other". */
export function sampleLabels(orderNumber: string, items: { testName: string; sampleType: SampleType | null }[]): SampleLabel[] {
  const byType = new Map<SampleType, string[]>();
  for (const i of items) {
    const type = i.sampleType ?? "other";
    byType.set(type, [...(byType.get(type) ?? []), i.testName]);
  }
  return ORDER.filter((type) => byType.has(type)).map((type) => ({ code: `${orderNumber}-${SAMPLE_LETTER[type]}`, sampleType: type, tests: byType.get(type)! }));
}

/** The order number inside a scanned sticker ("2026-27/LAB00012-B" → "2026-27/LAB00012"), or null when it isn't one. */
export function orderNumberFromScan(text: string): string | null {
  const m = text.trim().toUpperCase().match(/^(\d{4}-\d{2}\/LAB\d+)(?:-[BUSWO])?$/);
  return m ? m[1] : null;
}
