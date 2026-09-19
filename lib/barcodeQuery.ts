/** One search box takes both typed names and barcodes (hardware scanners
 * type the code and press Enter). On Enter, the text is a barcode when it
 * is a known product's barcode, or when it is all digits (6+) that no item
 * name contains — then it gets a clear "no product with this barcode"
 * instead of silently picking some other item. */
export function barcodeFromQuery(query: string, products: { name: string; barcode: string | null }[]): string | null {
  const code = query.trim();
  if (!code) return null;
  if (products.some((p) => p.barcode === code)) return code;
  if (/^\d{6,}$/.test(code) && !products.some((p) => p.name.toLowerCase().includes(code))) return code;
  return null;
}
