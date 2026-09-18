import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { SubscriptionCard } from "@/app/components/SubscriptionCard";
import { InstallAppButton } from "@/app/components/InstallAppButton";
import { LogoutButton } from "../more/LogoutButton";
import { Settings, ChevronRight, Printer, Palette, HelpCircle, SlidersHorizontal, ScanLine } from "lucide-react";

export default async function ProfilePage() {
  const session = await requireSession();
  const { t } = await getTranslator();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">Profile</h1>

      {/* Genuine business-identity card — who's logged in and where. */}
      <div
        className="flex items-center gap-3.5 rounded-2xl p-4"
        style={{
          background: "var(--surface)",
          boxShadow: "var(--elev-sm)",
        }}
      >
        {session.shopLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small avatar, external URL
          <img
            src={session.shopLogoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            style={{ boxShadow: "var(--elev-xs)" }}
          />
        ) : (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
            style={{
              background: "var(--brand)",
              color: "white",
              boxShadow: "var(--elev-xs)",
            }}
          >
            {session.shopName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{session.shopName}</p>
          <p className="truncate text-sm text-muted">
            {session.staffName} · <span className="capitalize">{session.role}</span>
          </p>
        </div>
      </div>

      <SubscriptionCard />
      <InstallAppButton />

      <Link
        href="/settings"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "var(--elev-xs)" }}
        >
          <Settings size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{t("more.settings")}</p>
          <p className="truncate text-xs text-muted">{t("more.settings.sub")}</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      <Link
        href="/thermal-print-settings"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "var(--elev-xs)" }}
        >
          <Printer size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Thermal print settings</p>
          <p className="truncate text-xs text-muted">Bold & size for 58mm and 80mm receipts</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      <Link
        href="/invoice-settings"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "var(--elev-xs)" }}
        >
          <Palette size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Invoice design</p>
          <p className="truncate text-xs text-muted">Tagline, footer, terms, accent colour</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      <Link
        href="/preferences"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "var(--elev-xs)" }}
        >
          <SlidersHorizontal size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Preferences</p>
          <p className="truncate text-xs text-muted">Language, theme, accent, text colour</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      {session.role === "owner" && (
        <Link
          href="/barcode-settings"
          className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
            style={{ boxShadow: "var(--elev-xs)" }}
          >
            <ScanLine size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">Barcode scanning</p>
            <p className="truncate text-xs text-muted">Camera, hardware scanner, or both</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link>
      )}

      <Link
        href="/help"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "var(--elev-xs)" }}
        >
          <HelpCircle size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Help & guide</p>
          <p className="truncate text-xs text-muted">How every screen and button works</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      <LogoutButton logoutLabel={t("more.logout")} thisDeviceLabel="Log out of this device" allDevicesLabel="Log out of all devices" />
    </div>
  );
}
