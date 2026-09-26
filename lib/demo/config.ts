/** The public demo (/demo): one ready-made shop per business type, filled with
 * made-up data, that anyone can open without an account. Every demo shop is a
 * separate shop in the same database (so it behaves exactly like the real app),
 * owned by a login on the demo.theray.in domain, and is wiped and refilled every
 * night. Nothing here touches a real shop's data. */
export const DEMO_DOMAIN = "demo.theray.in";

export const DEMO_TYPES = [
  "grocery",
  "mart",
  "hardware",
  "pharmacy",
  "restaurant",
  "hotel",
  "rental",
  "transport",
  "service",
  "salon",
  "jewellery",
  "clinic",
  "gym",
  "lab",
  "general",
] as const;
export type DemoType = (typeof DEMO_TYPES)[number];

export function isDemoType(value: string): value is DemoType {
  return (DEMO_TYPES as readonly string[]).includes(value);
}

export type DemoBusiness = {
  type: DemoType;
  /** Short name shown on the demo page. */
  title: string;
  /** The shop's own name inside the demo. */
  shopName: string;
  ownerName: string;
  city: string;
  state: string;
  stateCode: string;
  /** One line for a person or AI deciding which demo to open. */
  blurb: string;
  /** Things worth showing in a video, in a sensible order. */
  tour: string[];
};

export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    type: "grocery",
    title: "Grocery / Kirana",
    shopName: "Sharma Kirana Store",
    ownerName: "Rakesh Sharma",
    city: "Pune",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Barcode billing, GST on every item, udhaar khata, low-stock alerts, loyalty points.",
    tour: ["Dashboard with sales, udhaar and low stock", "New bill: search or scan an item, add a customer, part-payment", "Customers: who owes what, send a WhatsApp reminder", "Products with stock, HSN, GST%", "Purchases from a vendor and stock coming in", "Reports: daily summary, GSTR-1, GSTR-3B"],
  },
  {
    type: "mart",
    title: "Supermarket / Mart",
    shopName: "Patil Super Mart",
    ownerName: "Sunita Patil",
    city: "Nashik",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Fast counter billing with MRP, offers, bulk pricing and fast-billing tiles.",
    tour: ["Fast billing counter", "MRP and savings on the bill", "Offers and bulk pricing", "Stock audit", "Reorder low stock to a vendor", "Profit leak detector"],
  },
  {
    type: "hardware",
    title: "Hardware / Building material",
    shopName: "Shree Hardware & Paints",
    ownerName: "Mahesh Jadhav",
    city: "Kolhapur",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Warranty items, bulk rates, contractor udhaar, mismatched-stock checks.",
    tour: ["Billing with warranty items", "Contractor customers and udhaar", "Warranty lookup", "Purchases and vendor payments", "Stock and reorder"],
  },
  {
    type: "pharmacy",
    title: "Pharmacy / Medical store",
    shopName: "Jeevan Medical & General",
    ownerName: "Dr. Anil Kulkarni",
    city: "Pune",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Batch and expiry tracking, Schedule H1 register, prescription-only items, loose tablets.",
    tour: ["Billing a prescription item with doctor and patient", "Expiry alerts and write-offs", "Batches on each product", "Schedule H1 & X register", "Doctor-wise sales"],
  },
  {
    type: "restaurant",
    title: "Restaurant / Cafe",
    shopName: "Spice Route Kitchen",
    ownerName: "Imran Khan",
    city: "Mumbai",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Tables, KOT to the kitchen, kitchen display (TV), split bills, combos, reservations.",
    tour: ["Tables screen with free / occupied tables", "Open a table, add dishes, send to the kitchen", "Kitchen display on a TV", "Settle a bill with split payment", "Combos and reservations", "Item-wise sales report"],
  },
  {
    type: "hotel",
    title: "Hotel / Lodge",
    shopName: "Hotel Sai Residency",
    ownerName: "Vikram Deshmukh",
    city: "Shirdi",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Rooms and rates, bookings from walk-in / MakeMyTrip / Booking.com, check-in, room service billed at check-out, GST invoice.",
    tour: ["Front desk: arrivals, departures, in-house", "Room board and the 14-day calendar", "New booking from an OTA with commission", "Check-in with ID", "Room service charged to the room", "Check-out: pay part, keep the rest as udhaar, GST invoice", "Hotel reports and guest register"],
  },
  {
    type: "rental",
    title: "Rental business",
    shopName: "Om Sai Event Rentals",
    ownerName: "Ganesh Pawar",
    city: "Aurangabad",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Chairs, tents, sound systems on rent with deposits, date clash blocking and returns.",
    tour: ["New rental with dates and deposit", "Availability and clash blocking", "Active rentals and returns", "Rental history"],
  },
  {
    type: "transport",
    title: "Transport & Materials",
    shopName: "Bhosale Sand & Transport",
    ownerName: "Santosh Bhosale",
    city: "Satara",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Material sales with transport charge, vehicle-wise trips, per-km rates, document expiry.",
    tour: ["Bill with a transport line and vehicle", "Vehicles and their documents", "Vehicle-wise trip report"],
  },
  {
    type: "service",
    title: "Repair & Services",
    shopName: "QuickFix Mobile & AC Repair",
    ownerName: "Nitin More",
    city: "Thane",
    state: "Maharashtra",
    stateCode: "27",
    blurb: "Job cards with status tracking, parts, technician split, customer status link.",
    tour: ["All jobs by status", "New job: take an item in", "Add parts and labour, mark ready", "Bill the job", "Job report by technician"],
  },
  {
    type: "salon",
    title: "Salon / Spa",
    shopName: "Glow Unisex Salon",
    ownerName: "Pooja Nair",
    city: "Bengaluru",
    state: "Karnataka",
    stateCode: "29",
    blurb: "Appointments, stylist-wise billing, online booking link, staff revenue.",
    tour: ["Appointments calendar", "Bill a service with a stylist", "Online booking page", "Staff-wise revenue"],
  },
  {
    type: "jewellery",
    title: "Jewellery",
    shopName: "Tanishq Alankar Jewellers",
    ownerName: "Rajesh Soni",
    city: "Jaipur",
    state: "Rajasthan",
    stateCode: "08",
    blurb: "Daily gold/silver rate, making charges, hallmark, old-gold exchange on the bill.",
    tour: ["Today's gold and silver rate", "Bill a gold item with making charge", "Old gold exchange", "Exchange history"],
  },
  {
    type: "clinic",
    title: "Clinic / Doctor",
    shopName: "Dr. Mehta's Family Clinic",
    ownerName: "Dr. Rohan Mehta",
    city: "Ahmedabad",
    state: "Gujarat",
    stateCode: "24",
    blurb: "Prescriptions with your own letterhead, appointments, patient history, treatment plans.",
    tour: ["Appointments", "Write a prescription", "Print the prescription pad", "Treatment plan to quotation to bill", "Medicine library"],
  },
  {
    type: "gym",
    title: "Gym / Fitness",
    shopName: "IronCore Fitness Club",
    ownerName: "Karan Malhotra",
    city: "Delhi",
    state: "Delhi",
    stateCode: "07",
    blurb: "Membership plans, expiry tracking, attendance, classes, leads, workout and diet plans.",
    tour: ["Members and who is expiring", "Sell a membership", "Attendance and the self check-in kiosk", "Classes and bookings", "Leads", "Workout and diet plan for a member"],
  },
  {
    type: "lab",
    title: "Lab / Diagnostics",
    shopName: "LifeCare Diagnostics",
    ownerName: "Dr. Neha Iyer",
    city: "Chennai",
    state: "Tamil Nadu",
    stateCode: "33",
    blurb: "Test catalog and packages, orders with sample status, result entry, printable reports.",
    tour: ["Test catalog with reference ranges", "New order for a patient", "Enter results", "Printable report", "Pending orders"],
  },
  {
    type: "general",
    title: "General store / Other",
    shopName: "Gupta Traders",
    ownerName: "Anil Gupta",
    city: "Indore",
    state: "Madhya Pradesh",
    stateCode: "23",
    blurb: "A plain, flexible billing app for any other kind of shop.",
    tour: ["Billing", "Customers and udhaar", "Purchases", "Reports and GST"],
  },
];

export function demoBusiness(type: DemoType): DemoBusiness {
  return DEMO_BUSINESSES.find((b) => b.type === type)!;
}

export function demoEmail(type: DemoType): string {
  return `demo-${type}@${DEMO_DOMAIN}`;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
}

/** A demo shop is recognised by the " (demo)" the seeder adds to its legal name. */
export function isDemoShopName(legalName: string | null | undefined): boolean {
  return !!legalName && legalName.endsWith(" (demo)");
}

/** A demo shop older than this is wiped and refilled the next time someone opens it. */
export const DEMO_MAX_AGE_HOURS = 20;
