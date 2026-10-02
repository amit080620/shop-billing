"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { screenOf } from "@/lib/speedWatch";

type PostHog = typeof import("posthog-js").default;

let posthog: PostHog | null = null;
let starting = false;

/** Product analytics (PostHog), once NEXT_PUBLIC_POSTHOG_KEY is set: which screens shops use and
 * where a new shop gets stuck between signing up and its first bill, with session recordings to see
 * how. Built not to cost the shop anything:
 * - loaded after the app is up and the phone is idle, and never in Lite Mode (old phones);
 * - every recording hides all text and inputs, so no names, numbers or amounts leave the phone;
 * - screens are counted without their ids, and a shop is known only by its id, type and plan.
 * Only inside a shop's own app (the dashboard layout), never on public pages customers see. */
export function Analytics({ shopId, businessType, plan, role }: { shopId: string; businessType: string; plan: string; role: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog || starting || document.documentElement.classList.contains("lite-mode")) return;
    starting = true;
    const start = () =>
      import("posthog-js")
        .then(({ default: ph }) => {
          ph.init(key, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
            capture_pageview: false,
            capture_pageleave: false,
            // Only screens and (masked) recordings: nothing that reads what is tapped, nor extra uploads or
            // scripts on a phone, whatever is switched on in PostHog's settings. Speed is Speed watch's job,
            // errors are Sentry's.
            autocapture: false,
            rageclick: false,
            capture_dead_clicks: false,
            enable_heatmaps: false,
            capture_heatmaps: false,
            capture_performance: false,
            capture_exceptions: false,
            disable_surveys: true,
            person_profiles: "identified_only",
            mask_all_text: true,
            mask_all_element_attributes: true,
            session_recording: { maskAllInputs: true, maskTextSelector: "*" },
          });
          ph.identify(shopId, { business_type: businessType, plan });
          ph.register({ role });
          posthog = ph;
          ph.capture("$pageview", { $current_url: `${location.origin}${screenOf(location.pathname)}` });
        })
        .catch(() => {
          starting = false;
        });
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const timer = setTimeout(() => (idle ? idle(start, { timeout: 5000 }) : start()), 4000);
    return () => clearTimeout(timer);
  }, [shopId, businessType, plan, role]);

  useEffect(() => {
    posthog?.capture("$pageview", { $current_url: `${location.origin}${screenOf(pathname)}` });
  }, [pathname]);

  return null;
}
