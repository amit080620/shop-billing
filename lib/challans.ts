// Delivery challans: goods go out first with a challan (quantities, no prices); the bill follows,
// for one challan or for several of the same customer. Pure helpers, shared by the screens and tests.

export type ChallanLine = { productId: string | null; name: string; unit: string; quantity: number };

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Several challans as one bill's lines: the same catalogue item added up, loose lines kept apart. */
export function mergeChallanLines(challans: { items: ChallanLine[] }[]): ChallanLine[] {
  const out: ChallanLine[] = [];
  const byProduct = new Map<string, ChallanLine>();
  for (const c of challans) {
    for (const l of c.items) {
      if (!(l.quantity > 0)) continue;
      if (l.productId) {
        const had = byProduct.get(l.productId);
        if (had) {
          had.quantity = round3(had.quantity + l.quantity);
          continue;
        }
        const line = { ...l };
        byProduct.set(l.productId, line);
        out.push(line);
      } else out.push({ ...l });
    }
  }
  return out;
}

/** The lines a challan may be saved with: named, a positive quantity, at most 100 of them. */
export function cleanChallanLines(lines: ChallanLine[]): ChallanLine[] {
  return lines
    .map((l) => ({ productId: l.productId && /^[0-9a-f-]{36}$/i.test(l.productId) ? l.productId : null, name: String(l.name ?? "").trim().slice(0, 120), unit: String(l.unit ?? "NOS").trim().slice(0, 20) || "NOS", quantity: round3(Number(l.quantity)) }))
    .filter((l) => l.name && l.quantity > 0 && l.quantity <= 1_000_000)
    .slice(0, 100);
}
