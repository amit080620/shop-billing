import { planFor, type PlanKey } from "./plans";

/** The Ray's own sales desk: who a shop talks to, what else is on sale
 * besides plans, and what's coming. Everything here is plain data so
 * prices and wording can be changed in one place without touching a
 * screen. Hardware prices are indicative — confirmed on WhatsApp when a
 * shop enquires, because street prices move. */

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
    name: "E-invoice and e-way bill",
    description: "Generate the government IRN and e-way bill straight from a sale.",
  },
  {
    id: "tally-export",
    name: "Tally export",
    description: "Hand your CA a Tally-ready file instead of spreadsheets.",
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
