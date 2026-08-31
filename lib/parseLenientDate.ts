/** Best-effort parser for whatever date format a handwritten register
 * might use — DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY, etc. Falls back to
 * today if genuinely unparseable, since the review screen lets the
 * person fix the date by hand before anything is saved anyway — this
 * just saves them from having to type EVERY date from scratch when
 * most will parse correctly. */
export function parseLenientDate(raw: string): string {
  const cleaned = raw.trim().replace(/[.\s]/g, "/");
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, d, m, yRaw] = match;
    const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    const candidate = `${year}-${month}-${day}`;
    if (!Number.isNaN(new Date(candidate).getTime())) return candidate;
  }
  return new Date().toISOString().slice(0, 10);
}
