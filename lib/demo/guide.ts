import { DEMO_BUSINESSES, DEMO_DOMAIN, type DemoType } from "./config";

/** The written guide to the demo, for a person or an AI agent that has to understand
 * the whole product before recording a video of it. One source: the /demo/guide page
 * and the plain-text /demo/guide.md both come from these blocks. */
export type GuideBlock = { h: 1 | 2 | 3; text: string } | { p: string } | { ul: string[] } | { code: string };

const SCREENS: Record<DemoType, { path: string; what: string }[]> = {
  grocery: [
    { path: "/dashboard", what: "Home: today's sales, money owed by customers, low stock, the shop-health score and the three things worth doing today" },
    { path: "/fast-billing", what: "The tap-to-add counter for busy hours" },
    { path: "/bills/new", what: "New bill: search or scan an item, pick a customer, discount, part payment (the rest becomes udhaar)" },
    { path: "/customers", what: "Customers with what each one owes; open one for the khata, payments and a WhatsApp reminder" },
    { path: "/products", what: "Items with GST%, HSN, stock, barcode; add an item" },
    { path: "/purchases", what: "Purchases from vendors (stock goes up, input GST recorded)" },
    { path: "/reports", what: "Daily summary, GSTR-1, GSTR-3B, purchase register, export to Excel" },
    { path: "/profit-leak", what: "Where money is stuck: udhaar, dead stock, low margins" },
  ],
  mart: [
    { path: "/fast-billing", what: "Fast billing counter" },
    { path: "/bills/new", what: "Billing with MRP, offers and bulk pricing" },
    { path: "/products", what: "Catalogue with offer prices and bulk rates" },
    { path: "/stock-audit", what: "Count stock and settle mismatches" },
    { path: "/reorder", what: "Send low-stock items to a vendor" },
    { path: "/dashboard", what: "Home and the shop-health score" },
  ],
  hardware: [
    { path: "/bills/new", what: "Billing, including items with a warranty" },
    { path: "/warranty", what: "Look up a warranty by phone number or invoice" },
    { path: "/customers", what: "Contractors and their udhaar" },
    { path: "/purchases", what: "Purchases and vendor payments" },
    { path: "/products", what: "Bulk rates, stock and reorder levels" },
    { path: "/dashboard", what: "Home" },
  ],
  pharmacy: [
    { path: "/dashboard", what: "Home with expiry and stock warnings" },
    { path: "/bills/new", what: "Billing a prescription item asks for the doctor's and patient's name" },
    { path: "/pharmacy/expiry", what: "Batches close to or past expiry" },
    { path: "/pharmacy/write-offs", what: "Stock written off as expired or damaged" },
    { path: "/pharmacy/schedule-x-register", what: "The Schedule H1 and X register (patient, doctor, batch, quantity)" },
    { path: "/pharmacy/doctors", what: "Sales by prescribing doctor" },
    { path: "/products", what: "Medicines with salt, rack, schedule and batches" },
  ],
  restaurant: [
    { path: "/restaurant", what: "Tables: free, occupied, reserved. Tap a table to take an order" },
    { path: "/restaurant-kds", what: "Kitchen display for a TV: tickets, tap an item when it is ready" },
    { path: "/restaurant/combos", what: "Combo deals" },
    { path: "/restaurant/reservations", what: "Table bookings with a token amount" },
    { path: "/restaurant/reports", what: "Sales by day and month; open a bill for its items" },
    { path: "/restaurant/reports/items", what: "Which dishes sell" },
    { path: "/products", what: "Menu with dish options (spice level, add-ons)" },
    { path: "/dashboard", what: "Home" },
  ],
  hotel: [
    { path: "/hotel", what: "Front desk: arriving, late arrivals, leaving, overstays, in-house guests" },
    { path: "/hotel/rooms", what: "Room board: vacant, occupied, needs cleaning, out of service" },
    { path: "/hotel/calendar", what: "14-day chart of every room and guest" },
    { path: "/hotel/bookings", what: "All bookings; search by guest, phone, booking number or OTA reference" },
    { path: "/hotel/bookings/new", what: "New booking from walk-in, phone, MakeMyTrip, Booking.com and others, with commission and an advance" },
    { path: "/hotel/reports", what: "Occupancy, ADR, RevPAR, revenue and commission by source, the guest register" },
    { path: "/hotel/setup", what: "Room types, room numbers, tariffs and GST" },
    { path: "/restaurant", what: "Room tables: an order for a room is charged to the guest and paid at check-out" },
    { path: "/restaurant-kds", what: "Kitchen display, including room-service orders" },
  ],
  rental: [
    { path: "/rentals/new", what: "New rental: items, dates, deposit; double-booking is blocked" },
    { path: "/rentals", what: "Rentals by status: booked, out now, overdue" },
    { path: "/rentals/history", what: "Returned and cancelled rentals" },
    { path: "/products", what: "Rentable items with daily, weekly rates and deposit" },
    { path: "/bills/new", what: "Ordinary sales next to rentals" },
    { path: "/dashboard", what: "Home" },
  ],
  transport: [
    { path: "/bills/new", what: "A sale with a transport line: pick a vehicle and the distance" },
    { path: "/transport/vehicles", what: "Vehicles, per-km rates and RC, insurance, PUC, fitness expiry" },
    { path: "/transport/reports", what: "Trips, kilometres and earnings for each vehicle" },
    { path: "/customers", what: "Customers and udhaar" },
    { path: "/dashboard", what: "Home" },
  ],
  service: [
    { path: "/service", what: "All jobs by status: received, in progress, ready, delivered" },
    { path: "/service/new", what: "Take an item in: customer, device, IMEI or serial, issue, estimate, advance" },
    { path: "/service/reports", what: "Earnings, technician split, item types" },
    { path: "/dashboard", what: "Home" },
  ],
  salon: [
    { path: "/salon/appointments", what: "The appointment book, with today's schedule" },
    { path: "/bills/new", what: "Bill a service and name the stylist" },
    { path: "/salon", what: "Staff-wise revenue" },
    { path: "/salon/settings/booking", what: "Working hours and the shareable online booking link" },
    { path: "/customers", what: "Customers and their visits" },
    { path: "/dashboard", what: "Home" },
  ],
  jewellery: [
    { path: "/jewellery/rates", what: "Today's gold and silver rate per gram" },
    { path: "/bills/new", what: "Add a jewellery item: weight, wastage, making charge and HUID; old-gold exchange" },
    { path: "/jewellery/exchanges", what: "History of old gold and silver taken in" },
    { path: "/products", what: "Coins, bars and silver articles" },
    { path: "/dashboard", what: "Home" },
  ],
  clinic: [
    { path: "/clinic/appointments", what: "Appointments with today's list" },
    { path: "/clinic/prescriptions/new", what: "Write a prescription: vitals, complaints, medicines, follow-up; print on the clinic's own letterhead" },
    { path: "/clinic/treatment-plans", what: "A plan turns into a quotation and then a bill" },
    { path: "/clinic/medicine-library", what: "Saved medicines, so names are never retyped" },
    { path: "/clinic/settings", what: "Prescription pad: letterhead, footer, fields" },
    { path: "/clinic/settings/booking", what: "Working hours and the online booking link" },
    { path: "/dashboard", what: "Home" },
  ],
  gym: [
    { path: "/gym/members", what: "Members: active, expiring this week, expired, on freeze" },
    { path: "/gym/members/new", what: "Sell a membership: pick a plan, take payment" },
    { path: "/gym/plans", what: "Membership plans" },
    { path: "/gym/attendance", what: "Who is inside now and the check-in log" },
    { path: "/gym/classes", what: "Weekly class schedule and bookings" },
    { path: "/gym/leads", what: "People who asked about joining, by stage" },
    { path: "/gym/kiosk-settings", what: "The self check-in kiosk for the entrance" },
    { path: "/dashboard", what: "Home" },
  ],
  lab: [
    { path: "/lab/orders", what: "Orders by status: booked, sample collected, processing, report ready, delivered" },
    { path: "/lab/orders/new", what: "New order: patient, tests or packages, home collection" },
    { path: "/lab/tests", what: "Test catalogue with reference ranges, and packages" },
    { path: "/dashboard", what: "Home" },
  ],
  general: [
    { path: "/bills/new", what: "Billing" },
    { path: "/customers", what: "Customers and udhaar" },
    { path: "/products", what: "Items and stock" },
    { path: "/purchases", what: "Purchases" },
    { path: "/reports", what: "Reports and GST" },
    { path: "/dashboard", what: "Home" },
  ],
};

export function guideBlocks(base: string, extraLinks: { label: string; url: string }[] = []): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  blocks.push({ h: 1, text: "The Ray: demo guide" });
  blocks.push({
    p: "The Ray is a billing app for Indian shops and small businesses. It does GST billing and invoices, udhaar (credit) tracking with WhatsApp reminders, stock, purchases, and the reports a CA needs (GSTR-1, GSTR-3B). Each kind of business gets its own screens: a restaurant has tables and a kitchen display, a hotel has rooms and bookings, a clinic has prescriptions, a gym has memberships, and so on. It runs in a phone browser, installs like an app, has an Android app, and works in English, Hindi and Marathi.",
  });

  blocks.push({ h: 2, text: "How to open a demo" });
  blocks.push({
    ul: [
      `Open ${base}/demo and pick a business, or go straight to ${base}/demo/enter/<type> (types are listed below). There is no sign-up and no password: the link logs you in to that business's demo shop and lands on its home screen.`,
      "Every demo is a complete shop with made-up data: products, customers, a month of bills, and the business's own records (rooms and bookings, tables and orders, patients and prescriptions, members and attendance, and so on). It is a separate shop, so nothing here touches a real business's data.",
      "The demo is refilled every night, so 'today' and 'this week' are always current, and anything you add or change lasts until then.",
      "A slim banner at the top of every demo screen says it is a demo and has a link back to the list.",
      "A few things are switched off because everyone shares the same demo shop: adding or removing staff, changing passwords, uploading photos, and contacting support. Everything else works, so go ahead and try it.",
      "All phone numbers are made up (90000 xxxxx). WhatsApp buttons open a chat link with a made-up number; nothing is sent.",
    ],
  });
  blocks.push({ p: "The business types and their links:" });
  blocks.push({ ul: DEMO_BUSINESSES.map((b) => `${b.title}: ${base}/demo/enter/${b.type}. ${b.blurb}`) });

  blocks.push({ h: 2, text: "Tips for recording a video" });
  blocks.push({
    ul: [
      "The app is phone-first. A 390x844 viewport shows it the way shop owners use it. Above 768 px wide it switches to a desktop layout with a sidebar, which is good for a second, wider take.",
      "Pages load in one to two seconds. Wait for the content before clicking; a spinner or a blank card just means it is still loading.",
      "Bottom bar: Home, then the tabs that matter for that business, then Reports. The menu button (top left) opens everything else, grouped by topic.",
      "Light and dark mode: open https://bill.theray.in/preferences (also under the profile screen, Preferences) and pick Light, Dark or Auto. Dark mode looks good on video.",
      "Language: English, Hindi and Marathi. Switch on the same Preferences screen, or at the top of the sign-up page. It changes the whole app.",
      "The search box at the top finds products, customers, bills and screens from anywhere.",
      "Show the shop-health score and its 'moves' on the Home screen: a single 0-100 number with the three most useful things to do today, each one tap away.",
      "Bills can be printed as A4, 58 mm or 80 mm thermal, sent on WhatsApp, or saved as a PDF. Open any bill and use the paper size switch.",
      "Prefer real flows over static screens: make a bill, take a payment, book a room, write a prescription. Every form saves for real (until the nightly refill).",
    ],
  });

  blocks.push({ h: 2, text: "Features every business has" });
  blocks.push({
    ul: [
      "Home: sales trend, money owed, low stock, birthdays, the shop-health score.",
      "New bill: search or scan an item, customer or walk-in, discount, split payment across cash, UPI and card, part payment with the balance as udhaar. GST is worked out per item (CGST + SGST inside the state, IGST across states).",
      "Customers: each person's khata (what they owe, every bill and payment), reminders by WhatsApp, birthdays, loyalty points.",
      "Purchases and vendors: buying stock, input GST, what is owed to each vendor.",
      "Reports: daily summary that matches the cash drawer, GSTR-1, GSTR-3B, purchase register, profit leak, and export to Excel or PDF.",
      "Petty cash: small daily expenses.",
      "Settings: shop profile and GSTIN, invoice design, thermal printer look, fast billing, loyalty, festival planner, offline billing.",
    ],
  });

  blocks.push({ h: 2, text: "What to show in each demo" });
  for (const b of DEMO_BUSINESSES) {
    blocks.push({ h: 3, text: `${b.title} (${base}/demo/enter/${b.type})` });
    blocks.push({ p: `${b.shopName}, ${b.city}. ${b.blurb}` });
    blocks.push({ p: "Screens worth opening (add the path to the site address after you have entered the demo):" });
    blocks.push({ ul: SCREENS[b.type].map((s) => `${s.path}: ${s.what}`) });
    blocks.push({ p: "Suggested order for a short video:" });
    blocks.push({ ul: b.tour });
  }

  if (extraLinks.length) {
    blocks.push({ h: 2, text: "Public pages customers see (no login)" });
    blocks.push({ p: "These are the links a shop shares with its customers. They work on their own:" });
    blocks.push({ ul: extraLinks.map((l) => `${l.label}: ${l.url}`) });
  }

  blocks.push({ h: 2, text: "A suggested full video" });
  blocks.push({
    ul: [
      "0:00 The problem: paper khata, calculator, GST confusion. One app for every kind of shop.",
      "0:20 Open the demo page and show a few business types. Pick a grocery store.",
      "0:40 Home screen, shop-health score, then make a bill with a scanned item, a customer, part payment, print or WhatsApp it.",
      "1:40 Customers: udhaar, reminder on WhatsApp. Reports: the daily summary and GSTR-1.",
      "2:30 A restaurant: tables, an order, the kitchen display, split payment.",
      "3:30 A hotel: front desk, an OTA booking, check-in, room service charged to the room, check-out with a GST invoice.",
      "5:00 Two or three more in quick cuts: clinic prescription, gym membership, jewellery with old-gold exchange, pharmacy expiry.",
      "6:00 Hindi and dark mode, then the call to action: free 14-day trial at the sign-up page.",
    ],
  });

  blocks.push({ h: 2, text: "Good to know" });
  blocks.push({
    ul: [
      `Demo logins use the ${DEMO_DOMAIN} domain; they are not real accounts and cannot be used to sign in at the normal login page.`,
      "If a demo says it is warming up, it is being refilled; try again in a minute.",
      "The real product needs a sign-up (free for 14 days, no card).",
    ],
  });
  return blocks;
}

export function guideMarkdown(blocks: GuideBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if ("h" in b) out.push(`${"#".repeat(b.h)} ${b.text}`, "");
    else if ("p" in b) out.push(b.p, "");
    else if ("ul" in b) out.push(...b.ul.map((x) => `- ${x}`), "");
    else out.push("```", b.code, "```", "");
  }
  return out.join("\n");
}
