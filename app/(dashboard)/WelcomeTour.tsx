"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Slide = {
  icon: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

const RETAIL_SLIDES: Slide[] = [
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
    body: "GSTR-1, GSTR-3B, your purchase register, Daily summary (for matching your cash drawer every evening), and Insights all live under Reports.",
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

const RESTAURANT_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for a restaurant",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "🍽",
    title: "Tables",
    body: "Tap a free (green) table to start an order — search the menu, tap items to add them. Tap an occupied (red) table to open its order and keep adding.",
  },
  {
    icon: "🍳",
    title: "Kitchen (KOT)",
    body: "Print KOT sends only the newly-added items to the kitchen — nothing gets shown twice. For a paperless setup, open the Kitchen tab on a TV or tablet in the kitchen — it updates itself every few seconds.",
  },
  {
    icon: "💰",
    title: "Settling a table",
    body: "When the table's ready to pay, tap Settle — you can split the payment across cash, card, and UPI. Cancelling an order needs the Manager PIN (set that up under Settings → Restaurant) so only a supervisor can void a started order.",
  },
  {
    icon: "📊",
    title: "Reports",
    body: "Restaurant sales (day-wise and month-wise, tap any bill for its items) lives under More → Restaurant. GSTR-1, GSTR-3B, and your purchase register are under Reports.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

const RENTAL_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for a rental business",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "🔁",
    title: "New rental",
    body: "Pick a customer, choose items marked \"Also available for rent\" (set that up per item in Inventory), a start/end date, and a security deposit. The app blocks double-booking the same item for overlapping dates automatically.",
  },
  {
    icon: "↩️",
    title: "Returns",
    body: "When items come back, open the rental and tap Process return — mark each item's condition. Any damage charge is deducted from the deposit automatically, and the rest is refunded.",
  },
  {
    icon: "📊",
    title: "Reports",
    body: "GSTR-1, GSTR-3B, and your purchase register live under Reports. Rental history (past returns) is under More → Rentals.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

const TRANSPORT_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for transport & materials",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "🧱",
    title: "Materials",
    body: "Your sand, cement, gravel etc. are managed under More → Materials — same as any product: name, price, GST, and the right unit (Ton/Quintal/Bag are all available, not just KG).",
  },
  {
    icon: "🚚",
    title: "Vehicles",
    body: "Add each truck under More → Transport → Vehicles with its own per-km rate. This is what powers the transport charge calculator when billing.",
  },
  {
    icon: "🧾",
    title: "One bill, material + transport",
    body: "In Sell, add materials as usual, then tap \"Add transport charge\" — pick the vehicle, enter the distance, and it's added to the same bill at the vehicle's per-km rate.",
  },
  {
    icon: "📊",
    title: "Vehicle-wise reports",
    body: "More → Transport → Vehicle-wise trips shows rounds, total km, and earnings per vehicle — filter by any date range.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

const SERVICE_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for repairs & services",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "🔧",
    title: "Job cards",
    body: "When an item comes in for service, tap + New job — capture the customer, the item, what needs doing, and an estimate. It gets a job number automatically.",
  },
  {
    icon: "📋",
    title: "Track progress",
    body: "Move a job through Received → In progress → Ready as work happens. Staff always know what's pending and what's waiting for pickup.",
  },
  {
    icon: "💬",
    title: "Notify on WhatsApp",
    body: "Once a job is marked Ready, one tap sends the customer a WhatsApp message letting them know their item is ready for pickup.",
  },
  {
    icon: "🧾",
    title: "Deliver & bill",
    body: "When the customer picks up, tap Deliver & bill — enter the final charge and it generates a real, numbered invoice automatically, counting any advance already paid.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

const SALON_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for your salon/spa",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "💇",
    title: "Services",
    body: "Your haircuts, facials, treatments live under More → Services — same as any product: name, price, GST%. Loose combos (e.g. haircut + beard) can just be added as separate lines on the same bill.",
  },
  {
    icon: "📅",
    title: "Book appointments",
    body: "Bottom tab → Appointments lets you book a slot for a customer in advance — date, time, service, stylist. On the day, mark them Arrived, then Completed once done.",
  },
  {
    icon: "🧾",
    title: "One bill, tag the stylist",
    body: "In Sell, add the services given — a \"Stylist / staff\" field lets you note who actually did the work, right on the same bill.",
  },
  {
    icon: "📊",
    title: "Staff-wise revenue",
    body: "More → Salon → Staff-wise revenue shows who's bringing in how much over any date range — handy when working out commission.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

const JEWELLERY_SLIDES: Slide[] = [
  {
    icon: "👋",
    title: "Welcome — this app is set up for your jewellery business",
    body: "A quick 30-second look at where everything lives — you can always come back to this from More → Help.",
  },
  {
    icon: "⚖️",
    title: "Set today's rate first",
    body: "Every morning, go to More → Jewellery → Today's rate and enter the gold/silver rate per gram. Every item billed that day uses this rate automatically.",
  },
  {
    icon: "💍",
    title: "Bill by weight",
    body: "In Sell, tap \"Add jewellery item by weight\" — pick a saved design or type one in, enter the weight in grams, and it calculates metal value + making charge + wastage instantly.",
  },
  {
    icon: "🧮",
    title: "Making charges & wastage",
    body: "Set each item's making charge (₹/gram, flat, or %) and wastage % once under More → Items — the calculator picks it up automatically from then on.",
  },
  {
    icon: "⚙️",
    title: "One last thing",
    body: "If you haven't already, set your shop's state under More → GST & shop profile — billing is blocked until that's filled in, since it decides CGST+SGST vs IGST on every invoice.",
    cta: { label: "Go to GST profile", href: "/settings" },
  },
];

function slidesFor(businessType: string) {
  if (businessType === "restaurant") return RESTAURANT_SLIDES;
  if (businessType === "rental") return RENTAL_SLIDES;
  if (businessType === "transport") return TRANSPORT_SLIDES;
  if (businessType === "service") return SERVICE_SLIDES;
  if (businessType === "salon") return SALON_SLIDES;
  if (businessType === "jewellery") return JEWELLERY_SLIDES;
  return RETAIL_SLIDES;
}

export function WelcomeTour({ storageKey, businessType }: { storageKey: string; businessType: string }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();
  const SLIDES = slidesFor(businessType);

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
