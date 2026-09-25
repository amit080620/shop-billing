import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { AuthForm } from "@/app/(auth)/AuthForm";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import { getTranslator } from "@/lib/i18n/server";
import { Login3DScene } from "./Login3DScene";

/** The login screen only — a deliberately different, more theatrical
 * first impression than the rest of the app. Every other auth screen
 * (signup, forgot/reset password) still uses the plain AuthShell in
 * app/(auth)/, on purpose: this is the door someone walks through once
 * a day, not a form they fill in once and never see again, so it's the
 * one place worth spending the extra weight on. Living outside the
 * (auth) route group is what lets it skip that shared layout's own
 * split-panel/light background entirely, rather than fighting it. */
export default async function LoginPage() {
  const { lang, t } = await getTranslator();

  return (
    <Login3DScene>
      <div
        style={
          {
            // Every var-backed class on this page (inputs, buttons, the
            // language toggle, focus rings) reads its colour from these
            // CSS custom properties. Scoping them once here — reusing the
            // app's OWN real dark-theme token values (.dark in
            // globals.css), not invented ones — keeps this screen pixel
            // consistent with dark mode everywhere else, and is required
            // (rather than plain Tailwind classes) because the global
            // input rules apply their colours with !important.
            "--background": "#0c0d11",
            "--surface": "#1c1f26",
            "--foreground": "#f4f5f7",
            "--muted": "#9aa1ad",
            "--border": "rgba(255,255,255,0.08)",
            "--border-strong": "rgba(255,255,255,0.14)",
            "--brand": "#6366f1",
            "--brand-dark": "#4f46e5",
            "--brand-light": "#a5b4fc",
            "--brand-soft": "#1e1b4b",
            "--brand-text": "#c7d2fe",
            "--danger": "#f06b7a",
            "--danger-soft": "#331520",
            "--focus-ring": "0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)",
          } as React.CSSProperties
        }
      >
        <div className="flex justify-end pb-4">
          <LanguageToggle lang={lang} />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">{t("login.title")}</h1>
          <p className="mt-1.5 text-sm text-white/60">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl [&_label]:text-white/80">
          <AuthForm
            action={loginAction}
            submitLabel={t("login.submit")}
            pleaseWaitLabel={t("auth.pleaseWait")}
            fields={[
              { name: "email", label: t("auth.email"), type: "email", placeholder: "you@example.com" },
              { name: "password", label: t("auth.password"), type: "password" },
            ]}
          />
          <p className="mt-3 text-center text-sm">
            <Link href="/forgot-password" className="font-medium text-white/70 hover:text-white">
              {t("Forgot password?")}
            </Link>
          </p>
        </div>

        <div className="mt-6 text-center text-sm text-white/55">
          {t("login.newShop")}{" "}
          <Link href="/signup" className="font-semibold text-white hover:text-white/80">
            {t("login.setOneUp")}
          </Link>
        </div>
      </div>
    </Login3DScene>
  );
}
