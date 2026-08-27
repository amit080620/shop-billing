import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import type { Lang } from "@/lib/i18n/dictionary";

export function AuthShell({
  lang,
  theme,
  title,
  subtitle,
  children,
  footer,
}: {
  lang: Lang;
  theme: "light" | "dark" | "auto";
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-12 md:min-h-screen"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -10%, var(--brand-soft), var(--background) 60%)",
      }}
    >
      <div className="page-enter mx-auto w-full max-w-sm">
        <div className="mb-4 flex justify-center gap-1.5 rounded-lg border border-border p-1">
          <LanguageToggle lang={lang} compact />
          <div className="w-px bg-border" />
          <ThemeToggle theme={theme} compact />
        </div>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-32 w-32 items-center justify-center rounded-full bg-background p-4"
            style={{ boxShadow: "-10px -10px 22px var(--neu-light), 10px 10px 22px var(--neu-dark)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, next/image adds no value here */}
            <img src="/brand-logo.png" alt="The Ray" className="h-full w-auto" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground neu-text">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="neu-card p-6">
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  );
}
