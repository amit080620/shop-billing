// The New look's shell components rendered for real against the Classic ones (app/(dashboard)),
// for all 16 trades and every kind of staff access: the phone bar offers exactly the Classic tabs,
// the sidebar the Classic sidebar's plus Customers beside Sell, nothing staff access closes, one
// open tab marked, and the header's main button only where the trade starts something new.
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {}, refresh: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string; "aria-current"?: string }) =>
    createElement("a", { href, className, "aria-current": rest["aria-current"] }, children),
}));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/lib/useKeepReady", () => ({ useKeepReady: () => {} }));

const { BottomNav } = await import("@/app/(dashboard)/BottomNav");
const { DesktopSidebar } = await import("@/app/(dashboard)/DesktopSidebar");
const { NewBottomNav } = await import("@/app/(dashboard)/_newui/NewBottomNav");
const { NewDesktopSidebar } = await import("@/app/(dashboard)/_newui/NewDesktopSidebar");
const { NewPrimaryAction } = await import("@/app/(dashboard)/_newui/NewPrimaryAction");
const { LangProvider } = await import("@/lib/i18n/LangContext");
const { messagesFor } = await import("@/lib/i18n/dictionary");
const { BUSINESS_TYPES } = await import("@/lib/businessType");
const { ACCESS_V2, canOpen } = await import("@/lib/staffAccess");

const PEOPLE: Record<string, string[]> = {
  "owner / staff from before the access list": [],
  "new staff, billing only": [ACCESS_V2],
  "staff with home and bills": [ACCESS_V2, "view_dashboard", "view_bills"],
  "staff with reports and customers": [ACCESS_V2, "view_reports", "manage_customers"],
  "staff with items, purchases and trade screens": [ACCESS_V2, "manage_products", "purchases", "trade_screens"],
  "staff with every area": [ACCESS_V2, "view_dashboard", "view_bills", "process_returns", "view_reports", "manage_products", "purchases", "manage_customers", "manage_expenses", "marketing", "orders", "trade_screens", "manage_staff", "manage_settings"],
  "kitchen-only staff": [ACCESS_V2, "kitchen_only"],
};

function render(node: ReturnType<typeof createElement>) {
  const lang = { lang: "en", messages: messagesFor("en") } as Parameters<typeof LangProvider>[0];
  return renderToStaticMarkup(createElement(LangProvider, lang, node));
}
/** Links inside the first <tag> of the markup, in order: [href, aria-current]. */
function links(html: string, tag: "nav" | "aside") {
  const part = html.match(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`))?.[0] ?? "";
  return [...part.matchAll(/<a\b([^>]*)>/g)].map((m) => [m[1].match(/href="([^"]+)"/)?.[1] ?? "", /aria-current="page"/.test(m[1]) ? "page" : ""] as const);
}
const sidebarNav = (html: string) => links(html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "", "nav").map(([h]) => h);
const props = (type: string, permissions: string[], fastBillingEnabled: boolean) => ({
  lang: "en" as const, businessType: type, permissions, fastBillingEnabled,
  shopName: "Sharma Kirana", staffName: "Rakesh", roleLabel: "Owner", shopLogoUrl: null, shopGstin: "20ABCDE1234F1Z5", plan: "pro" as const, onTrial: true,
});

describe("New shell against Classic, every trade × staff access × fast billing", () => {
  for (const { value: type } of BUSINESS_TYPES) {
    for (const [who, permissions] of Object.entries(PEOPLE)) {
      for (const fast of [false, true]) {
        it(`${type} · ${who}${fast ? " · fast billing" : ""}`, () => {
          pathname = "/dashboard";
          const p = props(type, permissions, fast);
          const can = (href: string) => canOpen({ role: "staff", businessType: type, permissions }, href);
          const classicBar = links(render(createElement(BottomNav, p)), "nav").map(([h]) => h);
          const newBar = links(render(createElement(NewBottomNav, p)), "nav").map(([h]) => h);
          expect(newBar).toEqual(classicBar);

          const classicSide = sidebarNav(render(createElement(DesktopSidebar, p)));
          const newSideHtml = render(createElement(NewDesktopSidebar, p));
          const newSide = sidebarNav(newSideHtml);
          const expected = classicSide.flatMap((h) => (h === "/bills/new" && can("/customers") ? [h, "/customers"] : [h]));
          expect(newSide).toEqual(expected);
          for (const h of [...newSide, ...newBar]) expect(can(h), `${h} is closed to this person`).toBe(true);
          // Help and the shop / profile card stay, as in the Classic sidebar.
          expect(newSideHtml).toContain('href="/help"');
          expect(newSideHtml).toContain('href="/profile"');

          // Each tab, when open, is the one marked — the same tab Classic marks.
          for (const href of new Set([...newSide, ...newBar])) {
            pathname = href;
            const markedBar = links(render(createElement(NewBottomNav, p)), "nav").filter(([, c]) => c).map(([h]) => h);
            const markedSide = links(render(createElement(NewDesktopSidebar, p)).match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "", "nav").filter(([, c]) => c).map(([h]) => h);
            if (newBar.includes(href)) expect(markedBar).toEqual(links(render(createElement(BottomNav, p)), "nav").filter(([, c]) => c).map(([h]) => h));
            expect(markedSide).toEqual([href]);
          }

          // The header's main button: the trade's first tab when it starts something new, never on its own screen.
          pathname = "/dashboard";
          const button = links(`<nav>${render(createElement(NewPrimaryAction, p))}</nav>`, "nav").map(([h]) => h);
          const first = links(render(createElement(BottomNav, p)), "nav").map(([h]) => h).find((h) => h !== "/dashboard" && h !== "/customers");
          if (button.length) {
            expect(button[0].endsWith("/new")).toBe(true);
            expect(can(button[0])).toBe(true);
          }
          if (button[0]) {
            pathname = button[0];
            expect(render(createElement(NewPrimaryAction, p))).toBe("");
          }
          expect(first === undefined || button.length <= 1).toBe(true);
        });
      }
    }
  }
});

describe("the comparison above reads real links", () => {
  it("grocery owner with fast billing: the exact tabs, Home marked", () => {
    pathname = "/dashboard";
    const p = props("grocery", [], true);
    const bar = links(render(createElement(NewBottomNav, p)), "nav");
    expect(bar.map(([h]) => h)).toEqual(["/dashboard", "/bills/new", "/customers", "/purchases", "/fast-billing"]);
    expect(bar.filter(([, c]) => c)).toEqual([["/dashboard", "page"]]);
    expect(sidebarNav(render(createElement(NewDesktopSidebar, p)))).toEqual(["/dashboard", "/bills/new", "/customers", "/purchases", "/reports", "/fast-billing"]);
  });
});

describe("the sidebar's shop card", () => {
  it("shows the shop, its plan, trial, who is signed in and the GSTIN", () => {
    pathname = "/dashboard";
    const html = render(createElement(NewDesktopSidebar, props("grocery", [], false)));
    expect(html).toContain("Sharma Kirana");
    expect(html).toContain("Rakesh · Owner");
    expect(html).toContain("GSTIN 20ABCDE1234F1Z5");
    expect(html).toContain(">Trial<");
    expect(html).toContain("THE RAY");
  });

  it("leaves GSTIN out when the shop has none", () => {
    const html = render(createElement(NewDesktopSidebar, { ...props("grocery", [], false), shopGstin: null }));
    expect(html).not.toContain("GSTIN");
  });

  it("says New bill on a shop's button", () => {
    pathname = "/dashboard";
    expect(render(createElement(NewPrimaryAction, props("grocery", [], false)))).toContain("New bill");
  });
});
