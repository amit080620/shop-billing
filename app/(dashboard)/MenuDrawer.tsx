"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

const MenuContext = createContext<{ open: () => void; close: () => void; isOpen: boolean }>({
  open: () => {},
  close: () => {},
  isOpen: false,
});

export function useMenu() {
  return useContext(MenuContext);
}

/** The More menu as a drawer over the current page. It opens instantly (no
 * navigation or reload), the phone's back button closes it, and picking a
 * page replaces the drawer's history entry — so Back from that page returns
 * to where the menu was opened, not to the menu. `menu` is rendered on the
 * server once per page load. */
export function MenuDrawerProvider({ title, menu, children }: { title: string; menu: React.ReactNode; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false); // drives the slide animation
  const hasEntry = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const open = useCallback(() => {
    if (hasEntry.current) return;
    window.history.pushState({ ...(window.history.state ?? {}), rayMenu: true }, "");
    hasEntry.current = true;
    setIsOpen(true);
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setTimeout(() => setIsOpen(false), 200);
  }, []);

  const close = useCallback(() => {
    if (hasEntry.current) {
      hasEntry.current = false;
      window.history.back(); // popstate hides it
    } else {
      hide();
    }
  }, [hide]);

  useEffect(() => {
    function onPop() {
      if (hasEntry.current) hasEntry.current = false;
      hide();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [hide, close]);

  // Any navigation (a link elsewhere on the page, search) closes it.
  useEffect(() => {
    hasEntry.current = false;
    hide();
  }, [pathname, hide]);

  function onClickCapture(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("/") || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const replace = hasEntry.current;
    hasEntry.current = false;
    hide();
    if (replace) router.replace(href);
    else router.push(href);
  }

  return (
    <MenuContext.Provider value={{ open, close, isOpen }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:left-72" role="dialog" aria-modal="true" aria-label={title}>
          <div onClick={close} className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} />
          <div
            onClickCapture={onClickCapture}
            className={`absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-200 ${
              visible ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
              <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
              <button type="button" onClick={close} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-10">{menu}</div>
          </div>
        </div>
      )}
    </MenuContext.Provider>
  );
}
