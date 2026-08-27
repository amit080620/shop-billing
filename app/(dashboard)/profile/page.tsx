import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getTheme, getAccent, getTextColor } from "@/lib/theme";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { AccentToggle } from "@/app/components/AccentToggle";
import { TextColorToggle } from "@/app/components/TextColorToggle";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { getTranslator } from "@/lib/i18n/server";
import { SubscriptionCard } from "@/app/components/SubscriptionCard";
import { InstallAppButton } from "@/app/components/InstallAppButton";
import { LogoutButton } from "../more/LogoutButton";
import { Settings, ChevronRight, Printer } from "lucide-react";

export default async function ProfilePage() {
  const session = await requireSession();
  const { lang, t } = await getTranslator();
  const theme = await getTheme();
  const accent = await getAccent();
  const textColor = await getTextColor();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold text-foreground">Profile</h1>

      {/* Genuine business-identity card — who's logged in and where. */}
      <div
        className="flex items-center gap-3.5 rounded-2xl p-4"
        style={{
          background: "linear-gradient(155deg, var(--surface) 0%, var(--background) 100%)",
          boxShadow: "-5px -5px 12px var(--neu-light), 5px 5px 14px var(--neu-dark), inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        {session.shopLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small avatar, external URL
          <img
            src={session.shopLogoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
          />
        ) : (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
            style={{
              background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))",
              color: "white",
              boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)",
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
          style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
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
          style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
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
        href="/thermal-print-settings"
        className="neu-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.98]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text"
          style={{ boxShadow: "-3px -3px 7px var(--neu-light), 3px 3px 7px var(--neu-dark)" }}
        >
          <Printer size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Thermal print settings</p>
          <p className="truncate text-xs text-muted">Bold & size for 58mm / 80mm receipts</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Preferences</p>
        <div className="neu-tray flex flex-col gap-2 p-2">
          <div className="neu-card flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">{t("more.language")}</p>
              <p className="text-xs text-muted">Applies to this device only</p>
            </div>
            <LanguageToggle lang={lang} compact />
          </div>
          <div className="neu-card flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-xs text-muted">Applies to this device only</p>
            </div>
            <ThemeToggle theme={theme} compact />
          </div>
          <div className="neu-card flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Accent color</p>
              <p className="text-xs text-muted">Applies to this device only</p>
            </div>
            <AccentToggle accent={accent} />
          </div>
          <div className="neu-card flex flex-col gap-2 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">Text color</p>
              <p className="text-xs text-muted">Applies to this device only</p>
            </div>
            <TextColorToggle textColor={textColor} />
          </div>
        </div>
      </div>

      <LogoutButton logoutLabel={t("more.logout")} thisDeviceLabel="Log out of this device" allDevicesLabel="Log out of all devices" />
    </div>
  );
}
