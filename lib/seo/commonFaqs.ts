import { PLAN_PRICES_LIVE } from "../sales";
import { isVenueTrade, offeredPlans, planName, planPrice } from "../plans";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The questions every trade's page answers the same way, with today's prices. */
export function commonFaqs(businessType: string, trade: string): { q: string; a: string }[] {
  const paid = offeredPlans(businessType).filter((k) => k !== "free");
  const prices = paid.map((k) => {
    const p = planPrice(k, businessType);
    return `${planName(k, businessType)} ${rupees(p.monthly)} a month (${rupees(p.yearly)} a year)`;
  });
  const price = PLAN_PRICES_LIVE
    ? `There is a free plan, and every feature can be tried free for 14 days without a card. ${isVenueTrade(businessType) ? "The complete plan for a" : "Paid plans for a"} ${trade}: ${prices.join(", ")}.`
    : "There is a free plan, and every feature can be tried free for 14 days without a card. Paid plans are priced for your kind of business.";
  return [
    { q: `How much does billing software for a ${trade} cost on The Ray?`, a: price },
    { q: "Does it work on a mobile phone?", a: "Yes. It runs on any Android phone, in the browser or as the Android app, and on a computer. Bills print on Bluetooth thermal printers straight from the phone." },
    { q: "Can I bill when the internet is down?", a: "Yes. Offline billing keeps the counter selling without internet; those bills are saved on the phone and go into your account when the connection is back." },
    { q: "Is it available in Hindi?", a: "Yes. The app works in English, Hindi and Marathi, and the training videos are in Hinglish." },
    { q: "Are GST returns included?", a: "Yes. GSTR-1, GSTR-3B and the purchase register come from your own bills and can be exported for your CA as Excel or PDF." },
    { q: "Is my data safe, and can I take it out?", a: "Your data is backed up every night in encrypted form, and you can download all of it as an Excel file any time from More → Backup." },
  ];
}
