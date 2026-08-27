"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";

export function HamburgerToggle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOpen = pathname === "/more" || pathname.startsWith("/more/");

  return (
    <button
      onClick={() => {
        if (isOpen) {
          router.back();
        } else {
          // Genuinely a real navigation (not router.push) — this is
          // what makes opening the drawer immune to being silently
          // cancelled by a background router.refresh() (e.g. from
          // CatalogOrderAlert's periodic polling), a genuine race
          // condition that otherwise made the hamburger occasionally
          // do nothing when tapped.
          window.location.href = "/more";
        }
      }}
      className={className}
      style={style}
      aria-label={isOpen ? "Close menu" : "Menu"}
    >
      <Menu size={17} />
    </button>
  );
}
