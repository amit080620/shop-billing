import Link from "next/link";
import { getTheme, getAccent, getTextColor } from "@/lib/theme";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { AccentToggle } from "@/app/components/AccentToggle";
import { TextColorToggle } from "@/app/components/TextColorToggle";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { SlidersHorizontal } from "lucide-react";

export default async function PreferencesPage() {
  const { lang, t } = await getTranslator();
  const theme = await getTheme();
  const accent = await getAccent();
  const textColor = await getTextColor();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="Preferences" icon={<SlidersHorizontal size={18} strokeWidth={1.8} />} />
      <Link href="/profile" className="text-sm text-muted">
        ← Profile
      </Link>

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
  );
}
