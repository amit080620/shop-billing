import { AuthIllustration } from "./AuthIllustration";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      {/* Branded panel — desktop/tablet only. On mobile this entire
          block is display:none, so the phone experience is byte-for-
          byte what it was before this layout existed. */}
      <div
        className="relative hidden overflow-hidden md:flex md:w-[45%] md:flex-col md:items-center md:justify-center md:p-12 lg:w-1/2"
        style={{ background: "linear-gradient(160deg, var(--brand-dark), var(--brand))" }}
      >
        <div className="w-full max-w-sm">
          <AuthIllustration />
        </div>
        <div className="mt-8 max-w-sm text-center">
          <h2 className="text-2xl font-bold text-white">Billing that keeps up with your shop</h2>
          <p className="mt-2 text-sm text-white/80">
            GST invoices, inventory, and udhaar tracking — built for the way small shops actually work.
          </p>
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
