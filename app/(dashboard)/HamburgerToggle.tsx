"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useMenu } from "./MenuDrawer";
import { canGoBackInApp } from "@/app/components/BackLink";

export function HamburgerToggle({ className, style, label }: { className?: string; style?: React.CSSProperties; label?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const menu = useMenu();
  // /more is only reached by a direct visit (bookmark, old link); there the
  // button closes that page instead of opening the drawer on top of it.
  const onMorePage = pathname === "/more";

  return (
    <button
      onClick={() => {
        if (onMorePage) {
          if (canGoBackInApp()) router.back();
          else router.push("/dashboard");
        } else if (menu.isOpen) {
          menu.close();
        } else {
          menu.open();
        }
      }}
      className={className}
      style={style}
      aria-label={label ? undefined : menu.isOpen || onMorePage ? "Close menu" : "Menu"}
      aria-expanded={menu.isOpen}
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
