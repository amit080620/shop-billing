import { AuthIllustrationLazy as AuthIllustration } from "./AuthIllustrationLazy";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Branded panel — desktop/tablet only. On a phone the form comes
          first; a tall illustration above it pushed the login button
          below the fold. The brand logo still leads the form itself. */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 md:flex md:w-[45%] lg:w-1/2"
        style={{ background: "linear-gradient(160deg, #1e1b4b 0%, #312e81 45%, #4338ca 100%)" }}
      >
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #c026d3, transparent 70%)" }}
          aria-hidden="true"
        />
        <p className="relative text-sm font-semibold tracking-wide text-white/80">THE RAY · Billing</p>
        <div className="relative mx-auto w-full max-w-sm">
          <AuthIllustration />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">Billing that keeps up with your shop</h2>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            GST invoices, inventory, and udhaar tracking — built for the way Indian businesses actually work.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-white/85">
            <li className="rounded-full border border-white/20 bg-white/10 px-3 py-1">GST-ready invoices</li>
            <li className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Works offline</li>
            <li className="rounded-full border border-white/20 bg-white/10 px-3 py-1">हिंदी · मराठी</li>
          </ul>
        </div>
      </div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
