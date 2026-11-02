/** Phones get Home first and, wherever bills are made, Customers (the
 * udhaar khata) next to Sell — the two places every shop app keeps in the
 * bottom bar. Five tabs at most: when a sixth would not fit, Reports moves to
 * More (it is also on Home), so Purchase stays one tap away — shops enter
 * stock every day, and could not find Purchase once it left the bar. The
 * desktop sidebar has its own Home link and uses the tabs as is. */
export function mobileTabs<T extends { href: string }>(tabs: T[], extra: { home: T; customers: T }): T[] {
  if (tabs.length === 1) return tabs; // kitchen-only staff
  const result: T[] = [extra.home];
  for (const tab of tabs) {
    result.push(tab);
    if (tab.href === "/bills/new") result.push(extra.customers);
  }
  if (result.length <= 5) return result;
  const fewer = result.filter((tab) => tab.href !== "/reports");
  return (fewer.length > 5 ? fewer.filter((tab) => tab.href !== "/purchases") : fewer).slice(0, 5);
}
