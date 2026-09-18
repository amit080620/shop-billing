"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";

export function HamburgerToggle({ className, style, label }: { className?: string; style?: React.CSSProperties; label?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOpen = pathname === "/more" || pathname.startsWith("/more/");

  return (
    <button
      onClick={() => {
        if (isOpen) {
          // router.back() silently does nothing if there's no real
          // browser history to go back to (landing directly on /more
          // via a bookmark, deep link, or fresh app launch) — exactly
          // the "back button doesn't work" case. Falling back to an
          // explicit destination guarantees this always does something.
          if (window.history.length > 1) router.back();
          else router.push("/dashboard");
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
      aria-label={label ? undefined : isOpen ? "Close menu" : "Menu"}
    >
      {label ? (
        <>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <Menu size={18} strokeWidth={1.8} />
          </span>
          {label}
        </>
      ) : (
        <Menu size={19} />
      )}
    </button>
  );
}
