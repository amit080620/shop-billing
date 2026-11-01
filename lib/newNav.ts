/** Navigation for the New look (lib/uiVersion). It offers only what the person already has: the
 * trade's own tabs (tabsFor in app/(dashboard)/BottomNav), already cut to what this person may open
 * (lib/staffAccess) — the New look restyles them and never adds a destination. */

/** The computer sidebar: Home, then the trade's tabs with Customers right after Sell — the phone
 * bar's order (lib/mobileTabs), without its five-tab limit, so Buy stays. Home and Customers only
 * when this person may open them, as on the phone. */
export function sidebarTabs<T extends { href: string }>(
  tabs: T[],
  extra: { home: T; customers: T },
  canOpen: (href: string) => boolean,
): T[] {
  const list = [extra.home, ...tabs.flatMap((tab) => (tab.href === "/bills/new" ? [tab, extra.customers] : [tab]))];
  return list.filter((tab) => canOpen(tab.href));
}

/** The header's main button on a computer: the trade's first tab when it starts something new
 * (a bill, a prescription, a member, a test order). None for trades whose first tab is a board —
 * tables, the front desk, the kitchen. */
export function primaryAction<T extends { href: string }>(tabs: T[]): T | null {
  const first = tabs[0];
  return first && first.href.endsWith("/new") ? first : null;
}
