import { AuthIllustration } from "./AuthIllustration";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      {/* Branded panel — full illustration + tagline on desktop/tablet;
          a compact version stays visible on mobile too (just shorter),
          so the branded moment is never simply invisible on a phone. */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-4 md:w-[45%] md:p-12 lg:w-1/2"
        style={{ background: "linear-gradient(160deg, var(--brand-dark), var(--brand))" }}
      >
        <div className="w-full max-w-[220px] md:max-w-sm">
          <AuthIllustration />
        </div>
        <div className="mt-4 max-w-sm text-center md:mt-8">
          <h2 className="text-lg font-bold text-white md:text-2xl">Billing that keeps up with your shop</h2>
          <p className="mt-1.5 text-xs text-white/80 md:mt-2 md:text-sm">
            GST invoices, inventory, and udhaar tracking — built for the way small shops actually work.
          </p>
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
