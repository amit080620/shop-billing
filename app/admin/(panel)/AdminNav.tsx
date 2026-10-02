"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useKeepReady } from "@/lib/useKeepReady";

const TABS = [
  { href: "/admin", label: "Shops", badge: null },
  { href: "/admin/support", label: "Support", badge: "support" },
  { href: "/admin/enquiries", label: "Enquiries", badge: "enquiries" },
  { href: "/admin/videos", label: "Videos", badge: null },
  { href: "/admin/speed", label: "Speed", badge: null },
] as const;

/** The admin tabs, each loaded ahead in full and kept fresh (useKeepReady), so switching tabs is
 * instant instead of waiting on the server — which, used a few times a day, was often cold. */
export function AdminNav({ counts }: { counts: { support: number; enquiries: number } }) {
  const pathname = usePathname();
  const active = TABS.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  useKeepReady(
    TABS.map((t) => t.href),
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
            prefetch
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
