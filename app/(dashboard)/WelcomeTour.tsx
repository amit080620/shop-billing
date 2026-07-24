"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Slide = {
  icon: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

const SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome to your shop's billing app",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "🛒",
    title: "Sell",
    body: "Build a bill — pick a customer or walk-in, add products (search, scan a barcode, or use your camera), then set how much is paid now. The rest becomes udhaar automatically.",
  },
  {
    icon: "📦",
    title: "Buy & Inventory",
    body: "Log what you buy from suppliers under Buy — this is your input GST record. Manage your product catalog, stock levels, and barcodes under More → Inventory.",
  },
  {
    icon: "📊",
    title: "Reports & Daily Summary",
    body: "GSTR-1, GSTR-3B and your purchase register live under Reports. For matching your cash drawer every evening, use More → Daily summary.",
  },
  {
    icon: "💬",
    title: "Reminders & Offers",
    body: "More → Udhaar reminders sends WhatsApp nudges to customers who owe you money. More → Send an offer does the same for promotions — both need you to tap Send yourself, since WhatsApp doesn't allow fully automatic sending.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

export function WelcomeTour({ storageKey }: { storageKey: string }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — just skip the tour.
    }
  }, [storageKey]);

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* nothing to persist to — tour will just show again next time */
    }
    setVisible(false);
  }

  if (!visible) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <div className="page-enter w-full max-w-sm rounded-t-2xl bg-surface p-6 shadow-lg sm:rounded-2xl">
        <div className="flex justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-brand" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">{slide.icon}</span>
          <h2 className="text-lg font-bold text-foreground">{slide.title}</h2>
          <p className="text-sm text-muted">{slide.body}</p>
        </div>

        <div className="mt-6 flex gap-2">
          {!isLast && (
            <button
              onClick={dismiss}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted"
            >
              Skip
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) {
                if (slide.cta) {
                  dismiss();
                  router.push(slide.cta.href);
                } else {
                  dismiss();
                }
              } else {
                setStep((s) => s + 1);
              }
            }}
            className="btn-primary flex-1 text-center"
          >
            {isLast ? (slide.cta ? slide.cta.label : "Got it") : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
