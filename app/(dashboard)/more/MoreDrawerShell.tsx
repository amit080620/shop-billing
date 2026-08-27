"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function MoreDrawerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Genuinely starts closed and slides open on mount — this is what
  // gives the actual "slide in" animation the first instant this
  // route renders, rather than just appearing already-open.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function close() {
    setOpen(false);
    // Genuinely wait for the slide-out animation before actually
    // navigating away, so the close feels like a real drawer closing
    // rather than an abrupt page-swap.
    setTimeout(() => router.back(), 200);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-40 md:top-0">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-background p-4 pb-8 shadow-2xl transition-transform duration-200 md:left-[72px] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
