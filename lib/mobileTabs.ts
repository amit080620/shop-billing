/** Phones get Home first and, wherever bills are made, Customers (the
 * udhaar khata) next to Sell — the two places every shop app keeps in the
 * bottom bar. Five tabs at most: Buy moves to More when a sixth would not
 * fit. The desktop sidebar has its own Home link and uses the tabs as is. */
export function mobileTabs<T extends { href: string }>(tabs: T[], extra: { home: T; customers: T }): T[] {
  if (tabs.length === 1) return tabs; // kitchen-only staff
  const result: T[] = [extra.home];
  for (const tab of tabs) {
    result.push(tab);
    if (tab.href === "/bills/new") result.push(extra.customers);
  }
  return result.length > 5 ? result.filter((tab) => tab.href !== "/purchases").slice(0, 5) : result;
}
