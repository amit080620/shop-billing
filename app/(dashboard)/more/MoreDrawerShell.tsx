"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function MoreDrawerShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  // Starts closed and slides open on mount, so the route change reads as a
  // drawer opening rather than an abrupt page swap.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setOpen(false);
    // Wait for the slide-out before navigating. router.back() does nothing
    // without real history (deep link, fresh launch), hence the fallback.
    setTimeout(() => {
      if (window.history.length > 1) router.back();
      else router.push("/dashboard");
    }, 200);
  }

  return (
    <div className="fixed inset-0 z-40 md:left-72" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={close} className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
      <div
        className={`absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
          <button type="button" onClick={close} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-10">{children}</div>
      </div>
    </div>
  );
}
