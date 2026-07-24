import { PageIcon } from "@/app/components/PageIcon";
import { HelpAccordion } from "./HelpAccordion";

const SECTIONS = [
  {
    title: "🏠 Home",
    items: [
      {
        q: "What do the top cards show?",
        a: "Today's sales, last 7 days, outstanding credit (customers who owe you), and payable to vendors (what you owe them). Tap \"Outstanding credit\" to jump straight to the reminders list.",
      },
      {
        q: "What's the GST card in the middle?",
        a: "This month's Output GST (from sales) vs Input GST (from purchases) vs estimated net payable. Tapping it opens the full GSTR-3B report.",
      },
      {
        q: "What's the Getting Started checklist?",
        a: "Shows only until you've completed the basics (GST profile, first product, first customer, first bill) — then disappears on its own.",
      },
    ],
  },
  {
    title: "🛒 Sell (new bill)",
    items: [
      {
        q: "Walk-in vs Existing customer?",
        a: "Walk-in means no record is kept of who bought it — fine for a simple cash sale. Choose Existing customer if the sale might involve udhaar (credit), since credit can only be tracked against a real customer record.",
      },
      {
        q: "How do I add products fast?",
        a: "Search by name, scan a barcode with a USB/Bluetooth scanner (tap the scan box), or use 📷 Scan with camera. Don't have the product yet? Use \"+ Add new product\" right there — no need to leave the bill.",
      },
      {
        q: "How do I bill 500 grams or half a litre?",
        a: "Tap the quantity number and type a decimal (e.g. 0.5), or use the quick chips (250g / 500g / 1kg) that appear for KG/LTR-priced items. For very small amounts (like 1 gram of saffron), there's a small \"or enter grams\" box next to the chips.",
      },
      {
        q: "What's Complete Ticket?",
        a: "The final step — choose the discount, confirm how much is being paid now (Fully paid / Full udhaar / a part payment), and how that payment was made (cash/card/UPI/etc). Whatever's left over becomes the customer's credit automatically.",
      },
      {
        q: "What happens after I generate the invoice?",
        a: "You land on the printable invoice — with buttons to Print, download as PDF, or send a WhatsApp message to the customer. If there's a balance due and you've set a UPI ID in Settings, a scannable/tappable payment QR appears too.",
      },
    ],
  },
  {
    title: "📦 Buy & Inventory",
    items: [
      {
        q: "What's the difference between Buy and Inventory?",
        a: "Buy (bottom nav) is for logging what you purchased from a vendor — this is your input GST/ITC record. Inventory (More → Inventory) is your product catalog — names, prices, GST%, HSN codes, barcodes, and stock levels.",
      },
      {
        q: "Do I have to track stock for every product?",
        a: "No — tracking is opt-in per product (tick \"Track stock\" when adding/editing one). Products without tracking are treated as always-available.",
      },
      {
        q: "What do the colored stock badges mean?",
        a: "🟢 Green = comfortably stocked. 🟠 Orange = within a few units of your low-stock threshold. 🔴 Red = at or below it. The same colors show up in the cart while billing, so you'll notice before you oversell something.",
      },
      {
        q: "Can I add my whole catalog at once?",
        a: "Yes — Inventory → \"📥 Bulk import/export\". Download the template, fill it in Excel/Google Sheets, then upload it back. Also useful for periodically exporting your catalog as a backup.",
      },
    ],
  },
  {
    title: "👥 Customers & Vendors",
    items: [
      {
        q: "What's the difference?",
        a: "Customers are people who buy from you (and may owe you money). Vendors are suppliers you buy from (and may owe them money). Each has its own ledger, payment history, and — for regular udhaar customers — a downloadable itemized statement.",
      },
      {
        q: "How do I add someone quickly?",
        a: "On Android Chrome, tap \"📱 Pick from contacts\" to fill in name and phone straight from your phone's contact list — no typing.",
      },
      {
        q: "What's the downloadable statement for?",
        a: "For customers who buy on credit regularly and settle up monthly — it lists every single day's items and every payment, so there's no dispute about what was taken when.",
      },
    ],
  },
  {
    title: "💬 Reminders & Offers",
    items: [
      {
        q: "Why do I still have to tap Send myself?",
        a: "WhatsApp doesn't allow any app to send messages on your behalf automatically — that's a WhatsApp platform rule, not a limitation of this app. These screens get you as close to one-tap as possible: select who you need (or Select all), then work through the list quickly.",
      },
      {
        q: "What does the days-pending badge mean?",
        a: "How long the customer's oldest unpaid bill has been outstanding, assuming payments settle the oldest debt first. Green = fresh (under 10 days), orange = 10–29 days, red = 30+ days.",
      },
    ],
  },
  {
    title: "🔔 Item requests",
    items: [
      {
        q: "What's this for?",
        a: "When a customer asks for something you don't have right now. Log their name/phone, what they want, and any advance taken. When it arrives, tap \"Mark available\" — a WhatsApp button appears with a ready-made \"it's here\" message.",
      },
    ],
  },
  {
    title: "📊 Reports & Daily Summary",
    items: [
      {
        q: "What are GSTR-1, GSTR-3B, and the Purchase Register?",
        a: "These mirror the tables the actual GST portal uses. GSTR-1 covers your sales (B2B, B2C, HSN summary). GSTR-3B is the monthly summary (output tax, ITC, net payable). The Purchase Register is your input-tax-credit record. None of these file anything automatically — export to CSV and enter them on the portal yourself, or hand them to your CA.",
      },
      {
        q: "What's Daily Summary for?",
        a: "End-of-day cash reconciliation. It breaks down every rupee that moved today — sales collected, old udhaar collected, purchases paid, vendor payments made — by payment method, and gives you one number: expected cash in the drawer.",
      },
      {
        q: "What's Insights?",
        a: "Fast-moving products (last 30 days) and dead stock (tracked items with no sale in 60+ days) — built from your own sales data, not an external AI service.",
      },
    ],
  },
  {
    title: "⚙️ Settings & Staff",
    items: [
      {
        q: "Why is my shop's state required?",
        a: "It decides whether a sale is CGST+SGST (same state as the customer) or IGST (different state) — required by law to get right, so billing is blocked until it's set.",
      },
      {
        q: "What's the UPI ID for?",
        a: "If set, invoices with an outstanding balance show a scannable/tappable payment QR code, so the customer can pay you directly from the printed or shared bill.",
      },
      {
        q: "How do I add another staff member?",
        a: "More → Staff (owner only) → Add staff. You set their email and a temporary password, which they use to log in — scoped to the same shop, with either Staff or Owner role.",
      },
    ],
  },
  {
    title: "🔴 🟡 🟢 Voiding a bill",
    items: [
      {
        q: "Why can't I just edit a bill?",
        a: "Once a GST invoice number is issued, it shouldn't be silently rewritten — it may already be reflected in a filed return. Instead, void it (owner only, with a reason) — the invoice number stays reserved, stock is restored, and it's excluded from every total and report. If the sale genuinely happened, create a fresh corrected invoice afterward.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <PageIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
            <path d="M12 17h.01" />
          </svg>
        </PageIcon>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Help & guide</h1>
          <p className="text-sm text-muted">Tap a question to expand it.</p>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          <HelpAccordion items={section.items} />
        </section>
      ))}
    </div>
  );
}
