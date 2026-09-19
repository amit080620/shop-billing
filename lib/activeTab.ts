/** The one tab to highlight: the longest tab path the URL sits under. Plain
 * startsWith lit up two tabs at once when one path extends another
 * (/lab/orders/new also matched "Orders" at /lab/orders). */
export function activeTabHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}
