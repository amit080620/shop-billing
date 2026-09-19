"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

// How deep the current page is in this tab's history *inside the app*.
// Each history entry remembers its own depth (in history.state), so going
// back restores the right number; the first page opened (a fresh launch,
// a shared link) is depth 1.
let depth = 0;
let lastPop = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPop = Date.now();
  });
}

function storedDepth(): number | undefined {
  const d = (window.history.state as { rayDepth?: unknown } | null)?.rayDepth;
  return typeof d === "number" ? d : undefined;
}

/** Mounted once in the dashboard layout. */
export function NavDepthTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const stored = storedDepth();
    if (stored !== undefined) {
      depth = stored;
      return;
    }
    const wentBack = Date.now() - lastPop < 1000;
    depth = wentBack ? Math.max(1, depth - 1) : depth + 1;
    try {
      window.history.replaceState({ ...(window.history.state ?? {}), rayDepth: depth }, "");
    } catch {
      // Some embedded browsers refuse replaceState; Back then uses its fallback.
    }
  }, [pathname]);
  return null;
}

/** True when the previous history entry is a page of this app. */
export function canGoBackInApp(): boolean {
  return depth > 1;
}

// Bottom-nav tab pages (every business type) are top-level screens: no
// Back link there, same as any app's main tabs.
const TAB_ROOTS = new Set([
  "/dashboard", "/bills/new", "/customers", "/purchases", "/reports", "/fast-billing",
  "/restaurant", "/restaurant-kds", "/rentals/new", "/transport/vehicles", "/service",
  "/salon/appointments", "/jewellery/rates", "/clinic/prescriptions/new", "/clinic/appointments",
  "/gym/members/new", "/gym/members", "/lab/orders/new", "/lab/orders",
]);

/** On-screen Back that behaves like the phone's back button: returns to
 * the page the person came from, and only when there is none (opened from
 * a link, fresh launch) goes to `fallback`, the page's natural parent. */
export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  if (TAB_ROOTS.has(pathname)) return null;
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (canGoBackInApp()) {
          e.preventDefault();
          router.back();
        }
      }}
      className="-ml-1 inline-flex items-center gap-0.5 self-start rounded-lg py-1.5 pl-1 pr-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
      {label ?? t("common.back")}
    </Link>
  );
}
