"use client";

import { useState, useTransition } from "react";
import { logoutThisDeviceAction, logoutAllDevicesAction } from "@/lib/actions/auth";
import { Smartphone, Globe } from "lucide-react";

export function LogoutButton({ logoutLabel, thisDeviceLabel, allDevicesLabel }: { logoutLabel: string; thisDeviceLabel: string; allDevicesLabel: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-border px-4 py-3 text-sm font-medium text-danger transition active:scale-[0.98]"
      >
        {logoutLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{logoutLabel}</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                disabled={isPending}
                onClick={() => startTransition(() => logoutThisDeviceAction())}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-left text-sm text-foreground disabled:opacity-60"
              >
                <Smartphone size={14} /> {thisDeviceLabel}
                <span className="mt-0.5 block text-xs text-muted">Other devices stay logged in.</span>
              </button>
              <button
                disabled={isPending}
                onClick={() => startTransition(() => logoutAllDevicesAction())}
                className="flex items-center gap-1.5 rounded-lg border border-danger px-4 py-2.5 text-left text-sm text-danger disabled:opacity-60"
              >
                <Globe size={14} /> {allDevicesLabel}
                <span className="mt-0.5 block text-xs text-danger/80">Signs out everywhere this account is logged in.</span>
              </button>
            </div>
            <button onClick={() => setOpen(false)} className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
