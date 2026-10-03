import type { Metadata } from "next";
import Link from "@/lib/link";
import { getTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Terms of service and refund policy | The Ray",
  description: "The rules for using The Ray: free trial, plans, payments, refunds, your data and our responsibilities — in plain language.",
  alternates: { canonical: "/terms" },
};

/** Terms of service and the refund policy for shops using The Ray. The short summary is shown in
 * the visitor's language; the full terms are in English, which is the binding version. */
export default async function TermsPage() {
  const { t } = await getTranslator();
  const summary = [
    t("Try everything free for 14 days. No card needed."),
    t("After the trial your shop stays on the Free plan, with all your data, unless you choose a paid plan."),
    t("Paid plan: full refund if you ask within 7 days of paying. After that, no refund — you keep the plan till it ends."),
    t("Printers and other hardware are replaced only if they arrive faulty."),
    t("Your data is yours. Download it any time from More → Backup. We never sell it."),
    t("GST rates and filings are your responsibility — The Ray is a tool, not tax advice."),
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 text-sm leading-relaxed text-foreground">
      <div>
        <h1 className="text-xl font-semibold">Terms of service and refund policy</h1>
        <p className="mt-1 text-xs text-muted">Effective from 1 October 2026 · bill.theray.in</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-base font-semibold">{t("In short")}</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-foreground">
          {summary.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">{t("The full terms below are in English, and the English text is the one that applies.")}</p>
      </section>

      <Section title="1. What The Ray is">
        The Ray (&quot;we&quot;, &quot;us&quot;) is online software for running a shop: billing and GST invoices, udhaar, stock, purchases, reports and
        the tools for each kind of business. These terms apply to every shop that signs up (&quot;you&quot;) and to everyone who uses the shop&apos;s
        logins.
      </Section>

      <Section title="2. Your account">
        Give us correct details when you sign up. Keep your password private and remove a staff login when that person leaves — what is done
        through your shop&apos;s logins is your responsibility. Tell us straight away if you think someone else has got in.
      </Section>

      <Section title="3. Free trial and plans">
        Every new shop can use every feature free for 14 days, counting the day it signs up; no card is needed. After the trial the shop moves to the
        Free plan, which keeps working with its limits (for example a number of sales each month and items in the catalogue), and none of your
        data is lost. A paid plan or custom package is priced as agreed with you and confirmed in writing before you pay. It runs for the period
        you paid for. Plans do not renew on their own: we remind you before the end, and if you don&apos;t renew, the shop goes back to the Free
        plan with its data intact.
      </Section>

      <Section title="4. Payments">
        Plans, set-up services and hardware are paid in advance by UPI or bank transfer, with taxes as applicable. We send you a receipt and
        switch your plan on once the payment reaches us, normally the same day.
      </Section>

      <section id="refund" className="scroll-mt-6">
        <h2 className="text-base font-semibold">5. Refunds</h2>
        <ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>
            <b className="text-foreground">Free trial and Free plan:</b> nothing is charged, so there is nothing to refund.
          </li>
          <li>
            <b className="text-foreground">Paid plan or upgrade:</b> if you are not happy, ask within 7 days of paying and we refund the full amount
            to the same UPI or bank account within 7 working days. After 7 days we don&apos;t refund the rest of the period; you keep using the plan
            until it ends.
          </li>
          <li>
            <b className="text-foreground">Moving to a smaller plan:</b> takes effect when the current paid period ends.
          </li>
          <li>
            <b className="text-foreground">Set-up services:</b> refunded in full if you cancel before the work starts; not refunded once it has
            started.
          </li>
          <li>
            <b className="text-foreground">Printers, scanners and other hardware:</b> if an item arrives faulty, tell us within 7 days of delivery
            and we replace it. After that the maker&apos;s warranty applies. Hardware isn&apos;t taken back or refunded for a change of mind.
          </li>
          <li>To ask for a refund or replacement, use Help → Contact us in the app and quote your payment details.</li>
        </ul>
      </section>

      <Section title="6. Your data">
        Everything you put into The Ray — bills, customers, items, stock, and so on — belongs to you. You can download a full copy at any time
        from More → Backup. We use it only to run the service for you and never sell it. If you ask us to close your account, we delete your
        shop&apos;s data within 30 days, except records the law requires us to keep. How we treat your customers&apos; details is explained in
        the <Link href="/privacy-policy" className="font-medium text-brand-text underline">privacy policy</Link>.
      </Section>

      <Section title="7. Your responsibilities">
        The Ray prepares invoices, GST figures and reports from what you enter. Choosing the right GST rates, HSN codes and prices, and filing
        your returns, is your responsibility — The Ray is a tool, not tax or legal advice, so check your returns with your accountant. Use The Ray
        only for lawful business, and send WhatsApp or SMS messages only to customers who are happy to receive them.
      </Section>

      <Section title="8. Keeping the service running">
        We work hard to keep The Ray available and your data safe, but no online service can promise it will never be down; offline billing lets
        you keep selling during a break. We keep improving the app and may change how features look or work. If we ever have to remove a paid
        feature you rely on, we&apos;ll tell you in advance.
      </Section>

      <Section title="9. Limits on our responsibility">
        We are not responsible for indirect losses such as lost profit or lost business. If something goes wrong because of us, our total
        responsibility is limited to what you paid us in the 12 months before the problem.
      </Section>

      <Section title="10. Ending the service">
        You can stop using The Ray at any time. We may suspend a shop that misuses the service, tries to break into other accounts, or uses it
        for unlawful business, and we&apos;ll tell you why.
      </Section>

      <Section title="11. Changes to these terms">
        If we change these terms, we&apos;ll show a notice in the app before the change takes effect. Continuing to use The Ray after that means
        you accept the new terms.
      </Section>

      <Section title="12. Law and disputes">
        These terms are governed by the laws of India. If there is a disagreement, write to us first and we&apos;ll try to settle it within 30
        days; if we can&apos;t, it goes to the courts in India that have jurisdiction.
      </Section>

      <Section title="13. Contact">
        For anything about these terms, a refund or your data, use Help → Contact us inside the app — you get a reference number and an answer
        from our team.
      </Section>

      <p className="text-xs text-muted">
        <Link href="/signup" className="font-medium text-brand-text underline">
          Register now
        </Link>{" "}
        ·{" "}
        <Link href="/privacy-policy" className="font-medium text-brand-text underline">
          Privacy policy
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-muted">{children}</p>
    </section>
  );
}
