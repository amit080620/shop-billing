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
    <div className="flex min-h-screen flex-col px-5 py-6 md:px-10">
      {/* Language + theme sit in a corner and wrap if the screen is narrow,
          instead of forcing one wide row that ran off a phone's edge. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
          <LanguageToggle lang={lang} compact />
        </div>
        <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
          <ThemeToggle theme={theme} compact />
        </div>
      </div>

      <div className="page-enter mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
        <div className="mb-7 flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, next/image adds no value here */}
          <img src="/brand-logo.png" alt="The Ray" className="h-16 w-auto md:h-20" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--elevation-2)]">{children}</div>

        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  );
}
