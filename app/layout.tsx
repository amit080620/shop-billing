import type { Metadata, Viewport } from "next";
import { getTheme } from "@/lib/theme";
import { getLang } from "@/lib/i18n/server";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { ToastProvider } from "./components/Toast";
import { AutoThemeApplier } from "./components/ThemeToggle";
import { FocusScrollIntoView } from "./components/FocusScrollIntoView";
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
      </head>
      <body className="font-sans antialiased">
        <AutoThemeApplier theme={theme} />
        <ServiceWorkerRegistration />
        <FocusScrollIntoView />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
