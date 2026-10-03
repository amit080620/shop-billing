import Link from "@/lib/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 text-sm leading-relaxed text-foreground">
      <div>
        <h1 className="text-xl font-semibold">Privacy Notice</h1>
        <p className="mt-1 text-xs text-muted">Last updated: this is a genuine, plain-language notice — not a substitute for formal legal review.</p>
      </div>

      <section>
        <h2 className="text-base font-semibold">What we collect</h2>
        <p className="mt-1 text-muted">
          When you place an order, book an appointment, or provide your details to a shop using this billing
          software, we genuinely collect only what&apos;s needed to process that transaction:
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted">
          <li>Your name and phone number</li>
          <li>Delivery address or notes, if you provide them</li>
          <li>Your order/purchase history with that specific shop</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">Why we collect it</h2>
        <p className="mt-1 text-muted">
          Genuinely only to fulfil your order, contact you about it, maintain your account/credit history with the
          shop (if applicable), and — only where a shop has explicitly enabled it — occasionally send you offers or
          reminders via WhatsApp.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">Who can see it</h2>
        <p className="mt-1 text-muted">
          Your details are genuinely visible only to the specific shop you interacted with, and to that shop&apos;s
          own staff. We do not sell or share your data with any third party for marketing purposes.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">Keeping the app working well</h2>
        <p className="mt-1 text-muted">
          To find and fix problems quickly, the shop&apos;s app sends us error reports (through Sentry) and how it is used — which screens are
          opened and how fast they load (through PostHog and our own speed checks). These never include names, phone numbers, amounts or what
          is on a bill: screen recordings hide all text and typing. Every night the whole database is backed up in encrypted form, so it can
          be restored if something ever goes wrong.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">Your rights</h2>
        <p className="mt-1 text-muted">
          You can genuinely ask the shop you dealt with to show you, correct, or delete the data they hold about
          you at any time — contact them directly using the phone number or address they&apos;ve provided.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">How long we keep it</h2>
        <p className="mt-1 text-muted">
          Your data is genuinely retained for as long as the shop maintains an active account with us, primarily to
          preserve transaction records for tax/accounting purposes as required by Indian law.
        </p>
      </section>

      <p className="text-xs text-muted">
        This notice is provided in good faith to be genuinely clear and honest about our data practices. If you
        have questions or a request about your data, please contact the shop directly.
      </p>

      <p className="text-xs text-muted">
        Shop owners: the rules for using The Ray, refunds and your shop&apos;s data are in the{" "}
        <Link href="/terms" className="font-medium text-brand-text underline">
          terms of service and refund policy
        </Link>
        .
      </p>
    </div>
  );
}
