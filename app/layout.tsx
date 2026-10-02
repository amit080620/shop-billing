import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { getTheme, getLiteMode } from "@/lib/theme";
import { getTranslator } from "@/lib/i18n/server";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { ToastProvider } from "./components/Toast";
import { AutoThemeApplier } from "./components/ThemeToggle";
import { FocusScrollIntoView } from "./components/FocusScrollIntoView";
import { VersionWatcher } from "./components/VersionWatcher";
import { SpeedWatch } from "./components/SpeedWatch";
import { CalculatorAmountProvider } from "@/lib/calculatorAmount";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

const SITE_URL = "https://bill.theray.in";
const TITLE = "The Ray — Billing, GST & udhar for every kind of shop";
const DESCRIPTION =
  "GST billing, udhar reminders, stock and a daily health score for grocery, pharmacy, restaurants, salons, and every kind of shop in between. Free 14-day trial, no card needed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Ray - Shop Billing",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // The preview card a shared link shows on WhatsApp, Google, etc. —
  // the actual image comes from opengraph-image.tsx alongside this file,
  // generated at request time rather than a static export.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "The Ray",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Makes the browser actually shrink the visible viewport when the
  // on-screen keyboard opens, instead of just overlaying content —
  // this is the root fix for popups where the keyboard covers inputs
  // and scrolling/dismissal feels broken on mobile.
  interactiveWidget: "resizes-content",
  themeColor: "#4f46e5",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await getTheme();
  const liteMode = await getLiteMode();
  const { lang, t } = await getTranslator();

  return (
    <html
      lang={lang}
      className={`${plusJakartaSans.variable} ${notoSansDevanagari.variable} ${theme === "dark" ? "dark" : ""} ${liteMode ? "lite-mode" : ""}`}
      // The Lite Mode script below may set the class before React loads.
      suppressHydrationWarning
    >
      <head>
        {/* Lite Mode before the first paint. Preferences → Lite Mode can force it on or off; left on
            Auto (the default), it switches on for a phone with ≤2 GB memory or ≤4 cores, data saver,
            or a 2G/3G connection — and remembers the answer in a cookie so the server can skip the
            heavy bits (chart library, login scene) on the next page too. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=/(?:^|; )lite_mode=(on|off)/.exec(document.cookie),on;if(m){on=m[1]==="on";}else{var n=navigator,c=n.connection||{};on=(n.deviceMemory||8)<=2||(n.hardwareConcurrency||8)<=4||!!c.saveData||/2g|3g/.test(c.effectiveType||"");document.cookie="lite_auto="+(on?"1":"0")+"; path=/; max-age=2592000; samesite=lax";}document.documentElement.classList.toggle("lite-mode",on);}catch(e){}})();`,
          }}
        />
        {/* Genuinely the earliest point any code runs on this page —
            before React, before the app's own bundles, before even
            global-error.tsx exists. A crash this early (webpack module
            loading itself failing, usually a stale/mismatched JS chunk)
            is invisible to every React error boundary, which is why
            the generic "Application error" screen with no detail shows
            up instead of this app's own friendly crash page. This
            catches it directly and shows the REAL error text — no
            dev tools, no console, no navigating anywhere needed — plus
            tries one hard, cache-busting reload automatically, since a
            stale-chunk crash usually clears on a fresh fetch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function looksLikeChunkCrash(message) {
                  var m = (message || "").toLowerCase();
                  return (
                    m.indexOf("reading 'call'") !== -1 ||
                    m.indexOf("loading chunk") !== -1 ||
                    m.indexOf("failed to fetch dynamically imported module") !== -1 ||
                    m.indexOf("importing a module script failed") !== -1 ||
                    m.indexOf("was not found on the server") !== -1
                  );
                }
                function showRealError(message) {
                  // Same 30-second guard and key as lib/recovery.ts.
                  try {
                    var last = Number(sessionStorage.getItem("ray-auto-reload-at") || 0);
                    if (Date.now() - last > 30000) {
                      sessionStorage.setItem("ray-auto-reload-at", String(Date.now()));
                      location.reload();
                      return;
                    }
                  } catch (e) {}
                  document.body.innerHTML =
                    '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:system-ui,sans-serif;">' +
                    '<p style="font-size:16px;font-weight:600;color:#1a1a1a;">The app hit a loading problem</p>' +
                    '<p style="font-size:13px;color:#555;max-width:340px;word-break:break-word;">' + message + '</p>' +
                    '<button onclick="location.reload();" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;">Try again</button>' +
                    '</div>';
                }
                window.addEventListener("error", function (e) {
                  var msg = (e && e.message) || "Unknown script error";
                  if (looksLikeChunkCrash(msg)) showRealError(msg);
                });
                window.addEventListener("unhandledrejection", function (e) {
                  var msg = e && e.reason && (e.reason.message || String(e.reason));
                  if (looksLikeChunkCrash(msg || "")) showRealError(msg || "Unknown promise rejection");
                });
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AutoThemeApplier theme={theme} />
        <ServiceWorkerRegistration />
        <FocusScrollIntoView />
        <VersionWatcher words={{ available: t("A new version is available"), refresh: t("Refresh") }} />
        <SpeedWatch />
        <CalculatorAmountProvider>
          <ToastProvider>{children}</ToastProvider>
        </CalculatorAmountProvider>
      </body>
    </html>
  );
}
