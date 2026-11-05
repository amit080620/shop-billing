"use client";

import Link from "@/lib/link";
import { usePathname } from "next/navigation";
import { useKeepReady } from "@/lib/useKeepReady";

/** Read only when opened: it adds up every shop, so it is never loaded ahead or kept fresh behind the scenes. */
const ON_OPEN_ONLY = "/admin/users";

const TABS = [
  { href: "/admin", label: "Shops", badge: null },
  { href: "/admin/users", label: "Users", badge: null },
  { href: "/admin/support", label: "Support", badge: "support" },
  { href: "/admin/enquiries", label: "Enquiries", badge: "enquiries" },
  { href: "/admin/videos", label: "Videos", badge: null },
  { href: "/admin/speed", label: "Speed", badge: null },
] as const;

/** The admin tabs, each loaded ahead in full and kept fresh one at a time (useKeepReady), so
 * switching tabs is instant instead of waiting on the server. */
export function AdminNav({ counts }: { counts: { support: number; enquiries: number } }) {
  const pathname = usePathname();
  const active = TABS.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  useKeepReady(
    TABS.map((t) => t.href).filter((href) => href !== ON_OPEN_ONLY),
    pathname,
  );

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-800 px-4 py-2 text-xs font-medium">
      {TABS.map((tab) => {
        const n = tab.badge ? counts[tab.badge] : 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-no-prefetch={tab.href === ON_OPEN_ONLY ? "" : undefined}
            aria-current={tab.href === active ? "page" : undefined}
            className={`flex items-center rounded-lg px-2.5 py-1.5 ${tab.href === active ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {tab.label}
            {n > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">{n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
