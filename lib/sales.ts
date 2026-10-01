import { planFor, type PlanKey } from "./plans";

/** The Ray's own sales desk: who a shop talks to, what else is on sale
 * besides plans, and what's coming. Everything here is plain data so
 * prices and wording can be changed in one place without touching a
 * screen. Hardware prices are indicative — confirmed on WhatsApp when a
 * shop enquires, because street prices move. */

/** Which prices shops see. Plan prices are set by the owner (lib/plans.ts) and shown. Printers,
 * rolls and kits are priced on the call (street prices move), and the set-up services are not
 * priced yet — both say "Price on request" until switched on. Admin screens always show prices. */
export const PLAN_PRICES_LIVE = true;
export const HARDWARE_PRICES_LIVE = false;
export const SERVICE_PRICES_LIVE = false;

/** Switched off until the owner confirms the sales WhatsApp number below. While off, no screen
 * links to it: every "upgrade / enquire / book" tap only records the request, which reaches the
 * team as a push notification and in Admin → Enquiries, and support requests stay in the app.
 * Set to true to bring the WhatsApp buttons back. */
export const SALES_WHATSAPP_CONFIRMED = false;

/** WhatsApp number for renewals, hardware and support (country code, no +). */
export const SALES_WHATSAPP = "918123455501";

export function salesLink(message: string): string {
  return `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export type EnquiryKind = "plan" | "hardware" | "service" | "upcoming" | "custom";

export type HardwareItem = {
  id: string;
  name: string;
  price: number;
  /** Which of the app's own features this works with — so nobody buys a
   * printer the app can't drive. */
  worksWith: string;
  points: string[];
  /** Shown as a ribbon on a bundle. */
  bundle?: boolean;
  bestFor: string[]; // business types, [] = everyone
};

export const HARDWARE: HardwareItem[] = [
  {
    id: "printer-58-bt",
    name: "58mm Bluetooth receipt printer",
    price: 2499,
    worksWith: "Direct Bluetooth printing from the Android app",
    points: ["Pairs with your phone, no computer needed", "58mm rolls, prints a bill in about 2 seconds", "Rechargeable, runs a full day"],
    bestFor: [],
  },
  {
    id: "printer-80",
    name: "80mm USB + Bluetooth receipt printer",
    price: 5999,
    worksWith: "Bills, kitchen tickets (KOT) and one-tap printing on a computer",
    points: ["Fast, quiet, auto-cutter", "Use one at the counter and one in the kitchen", "Wide 80mm slip fits GST details"],
    bestFor: ["restaurant", "mart", "pharmacy", "grocery"],
  },
  {
    id: "scanner",
    name: "Barcode scanner (USB / wireless)",
    price: 1799,
    worksWith: "Scan-to-bill on the Sell screen and stock lookup",
    points: ["Plug in and scan, no set-up", "Reads printed labels and packet barcodes", "Pick 'Hardware scanner' in Barcode scanning"],
    bestFor: ["grocery", "mart", "pharmacy", "hardware", "general"],
  },
  {
    id: "rolls",
    name: "Thermal paper rolls — pack of 50",
    price: 1299,
    worksWith: "58mm receipt printers",
    points: ["Clean print that doesn't fade fast", "Fits every 58mm printer we sell", "Ships with your printer or on its own"],
    bestFor: [],
  },
  {
    id: "kit-counter",
    name: "Counter Starter Kit",
    price: 3999,
    worksWith: "58mm printer + barcode scanner + 20 rolls, tested together",
    points: ["Everything to start billing on day one", "Saves over ₹800 against buying separately", "Set up by us over a video call"],
    bundle: true,
    bestFor: ["grocery", "mart", "pharmacy", "hardware", "general"],
  },
  {
    id: "kit-restaurant",
    name: "Restaurant Kit",
    price: 11499,
    worksWith: "Two 80mm printers (counter + kitchen) with 20 rolls each",
    points: ["Bills at the counter, KOT in the kitchen", "Tested with the Tables and Kitchen screens", "Set up by us over a video call"],
    bundle: true,
    bestFor: ["restaurant"],
  },
];

export type ServiceItem = { id: string; name: string; price: number; description: string };

export const SERVICES: ServiceItem[] = [
  {
    id: "google-business",
    name: "Google Business Profile setup",
    price: 1499,
    description: "We create and verify your shop on Google Maps — photos, timings, phone, and your online order link — so people nearby can find you.",
  },
  {
    id: "whatsapp-business",
    name: "WhatsApp Business setup",
    price: 999,
    description: "Business profile, greeting and away messages, and your product catalog, connected to The Ray's order link.",
  },
  {
    id: "item-entry",
    name: "We enter your items for you",
    price: 1999,
    description: "Send a photo or a price list; we load up to 500 items with prices and GST so you can bill the same day.",
  },
  {
    id: "training",
    name: "Staff training (1 hour, video call)",
    price: 999,
    description: "Your counter staff learn billing, returns, udhaar and day-end closing on your own shop's data.",
  },
];

export type UpcomingItem = { id: string; name: string; description: string };

/** Not built yet — the "Notify me" button records interest so the order of
 * work follows what shops actually ask for. */
export const UPCOMING: UpcomingItem[] = [
  {
    id: "auto-whatsapp",
    name: "Automatic WhatsApp bills and reminders",
    description: "Invoices and udhaar reminders go out from your own WhatsApp Business number without tapping Send.",
  },
  {
    id: "google-sync",
    name: "Google Business sync",
    description: "Post your offers and festival posters to your Google listing, and keep your opening hours in step.",
  },
  {
    id: "upi-collect",
    name: "UPI collection with auto-matching",
    description: "Customers pay by QR and the bill marks itself paid.",
  },
  {
    id: "e-invoice",
    name: "IRN and e-way bill straight from a sale",
    description: "Today the app makes the government JSON for the portal (Reports → E-invoice & e-way bill). Next: the IRN and e-way bill without opening the portal.",
  },
];

/** The message a shop's enquiry sends — always carries the shop's name and
 * number so a reply doesn't start with "who is this?". */
export function enquiryMessage(opts: {
  kind: EnquiryKind;
  item: string;
  shopName: string;
  ownerPhone?: string | null;
  plan?: PlanKey;
}): string {
  const who = `${opts.shopName}${opts.ownerPhone ? ` (${opts.ownerPhone})` : ""}`;
  const current = opts.plan ? ` — we're on ${planFor(opts.plan).name}` : "";
  switch (opts.kind) {
    case "plan":
      return `Hi, this is ${who}${current}. I'd like to upgrade to the ${opts.item} plan on The Ray. Please share the payment details.`;
    case "hardware":
      return `Hi, this is ${who}. I'm interested in the ${opts.item} from The Ray. Please share availability and the final price.`;
    case "service":
      return `Hi, this is ${who}. I'd like to book: ${opts.item}. Please tell me the next steps.`;
    case "upcoming":
      return `Hi, this is ${who}. Please tell me when "${opts.item}" is ready — I'd use it.`;
    case "custom":
      return `Hi, this is ${who}${current}. I need a plan built around my shop: ${opts.item}`;
  }
}

export function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** The AI tools, as the Plan screen lists them — each one's daily use counts against the plan's
 * AI allowance (lib/plans AI_DAILY). */
export const AI_TOOLS: { name: string; what: string }[] = [
  { name: "AI shop assistant", what: "Ask in Hindi or English — today's sales, who owes udhaar, what's running low" },
  { name: "Speak to bill", what: "Say the items out loud and the bill fills itself" },
  { name: "Scan a price list or purchase bill", what: "A photo becomes your items with prices and GST, or a purchase entered" },
  { name: "Import old khata and sales register", what: "A photo of the old register becomes customers and their udhaar" },
  { name: "Shelf watch", what: "Photos of a shelf — the AI notices what is running out" },
  { name: "Birthday wishes, posters and price ideas", what: "Personal WhatsApp wishes, festival poster text, a fair price for a new item" },
];
