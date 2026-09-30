// Medicines with the same salt (composition) and strength can stand in for each other: when a
// brand is out of stock, the chemist offers another brand of the same salt. These compare two
// compositions however they were typed ("Paracetamol 500 mg", "paracetamol 500MG", "Amoxicillin
// 500mg + Clavulanic acid 125mg" in either order). Pure, so New Bill and the tests agree.

const UNIT = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|%)\b/gi;

/** One ingredient, normalised: lower case, single spaces, "500 mg" → "500mg", µg → mcg. */
function part(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\]]/g, " ")
    .replace(UNIT, (_, n: string, u: string) => `${Number(n)}${u.toLowerCase() === "µg" ? "mcg" : u.toLowerCase()}`)
    .replace(/\s+/g, " ")
    .trim();
}

/** A key that is the same for the same salts at the same strengths, whatever the order or spacing. */
export function saltKey(composition: string | null | undefined): string | null {
  if (!composition) return null;
  const parts = composition
    .split(/\s*(?:\+|,|&|\band\b)\s*/i)
    .map(part)
    .filter(Boolean);
  if (!parts.length) return null;
  return [...new Set(parts)].sort().join(" + ");
}

type Medicine = { id: string; salt?: string | null; trackInventory: boolean; stockQuantity: number; price: number };

/** Other medicines with the same salt and strength, the ones in stock first, then the cheapest. */
export function substitutesFor<T extends Medicine>(item: Pick<Medicine, "id" | "salt">, all: T[]): T[] {
  const key = saltKey(item.salt);
  if (!key) return [];
  const inStock = (m: T) => !m.trackInventory || m.stockQuantity > 0;
  return all
    .filter((m) => m.id !== item.id && saltKey(m.salt) === key)
    .sort((a, b) => Number(inStock(b)) - Number(inStock(a)) || a.price - b.price);
}
