"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { adminPushPublicKeyAction, removeAdminPushSubscriptionAction, saveAdminPushSubscriptionAction, sendTestPushAction } from "@/lib/actions/admin-push";

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Notify me on this phone": a push notification whenever a shop raises a support request, asks to
 * upgrade, or signs up — so nobody has to keep the admin panel open to find out. */
export function PushToggle() {
  const [state, setState] = useState<"checking" | "unsupported" | "blocked" | "off" | "on">("checking");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/admin/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  function turnOn() {
    setNote(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const { key, error } = await adminPushPublicKeyAction();
        if (!key) {
          setNote(error ?? "Could not turn on.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/admin-push-sw.js", { scope: "/admin/" });
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const saved = await saveAdminPushSubscriptionAction(json, navigator.userAgent);
        if (saved.error) {
          setNote(saved.error);
          return;
        }
        setState("on");
        setNote("On. A test notification is on its way.");
        await sendTestPushAction();
      } catch (e) {
        setNote(`Could not turn on: ${(e as Error).message}`);
      }
    });
  }

  function turnOff() {
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/admin/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removeAdminPushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setNote(null);
    });
  }

  if (state === "checking") return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-100">
          {state === "on" ? <Bell size={15} className="text-emerald-400" /> : <BellOff size={15} className="text-gray-400" />}
          {state === "on" ? "Notifications are on for this phone" : "Get notified on this phone"}
        </p>
        {state === "off" && (
          <button type="button" disabled={pending} onClick={turnOn} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-60">
            {pending ? "…" : "Turn on"}
          </button>
        )}
        {state === "on" && (
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await sendTestPushAction(); setNote(r.error ?? `Test sent to ${r.phones} phone(s).`); })} className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-200">
              Test
            </button>
            <button type="button" disabled={pending} onClick={turnOff} className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-400">
              Turn off
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {state === "unsupported"
          ? "This browser can't take notifications. On Android use Chrome; on iPhone, add the admin page to the Home Screen first."
          : state === "blocked"
            ? "Notifications are blocked for this site — allow them in the browser's site settings, then reload."
            : "A new support request (SR), an upgrade enquiry or a new shop pings this phone."}
      </p>
      {note && <p className="text-xs text-emerald-400">{note}</p>}
    </div>
  );
}
