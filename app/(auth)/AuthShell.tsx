import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import type { Lang } from "@/lib/i18n/dictionary";

export function AuthShell({
  lang,
  title,
  subtitle,
  children,
  footer,
}: {
  lang: Lang;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -10%, var(--brand-soft), var(--background) 60%)",
      }}
    >
      <div className="page-enter mx-auto w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LanguageToggle lang={lang} />
        </div>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
          >
            ₹
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg">
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  );
}
