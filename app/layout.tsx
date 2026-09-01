import type { Metadata, Viewport } from "next";
import { getTheme, getCalculatorEnabled, getAssistantEnabled } from "@/lib/theme";
import { getLang } from "@/lib/i18n/server";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { ToastProvider } from "./components/Toast";
import { AutoThemeApplier } from "./components/ThemeToggle";
import { FocusScrollIntoView } from "./components/FocusScrollIntoView";
import { FloatingCalculator } from "./components/FloatingCalculator";
import { FloatingAssistant } from "./components/FloatingAssistant";
import { CalculatorAmountProvider } from "@/lib/calculatorAmount";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Ray - Shop Billing",
  description: "Simple billing for small shops",
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
  const lang = await getLang();
  const calculatorEnabled = await getCalculatorEnabled();
  const assistantEnabled = await getAssistantEnabled();

  return (
    <html lang={lang} className={theme === "dark" ? "dark" : undefined}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- root layout is the correct place for this in the App Router */}
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
          rel="stylesheet"
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
                    m.indexOf("importing a module script failed") !== -1
                  );
                }
                function showRealError(message) {
                  try {
                    if (!sessionStorage.getItem("ray-early-crash-retried")) {
                      sessionStorage.setItem("ray-early-crash-retried", "1");
                      location.reload();
                      return;
                    }
                  } catch (e) {}
                  document.body.innerHTML =
                    '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:system-ui,sans-serif;">' +
                    '<p style="font-size:16px;font-weight:600;color:#1a1a1a;">The app hit a loading problem</p>' +
                    '<p style="font-size:13px;color:#555;max-width:340px;word-break:break-word;">' + message + '</p>' +
                    '<button onclick="sessionStorage.removeItem(\\'ray-early-crash-retried\\');location.reload();" style="background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:600;">Try again</button>' +
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
        <CalculatorAmountProvider>
          <ToastProvider>{children}</ToastProvider>
          <FloatingCalculator enabled={calculatorEnabled} />
          <FloatingAssistant enabled={assistantEnabled} />
        </CalculatorAmountProvider>
      </body>
    </html>
  );
}
