import Link from "@/lib/link";
import { resetPasswordAction } from "@/lib/actions/auth";
import { AuthShell } from "../AuthShell";
import { AuthForm } from "../AuthForm";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { ResetLinkGate } from "./ResetLinkGate";

export default async function ResetPasswordPage() {
  const { lang, t } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title={t("Set a new password")}
      subtitle={t("Choose a new password for your account.")}
      footer={
        <Link href="/login" className="font-semibold text-brand">
          ← {t("Back to login")}
        </Link>
      }
    >
      <ResetLinkGate words={{ checking: t("Checking your reset link…"), expired: t("This reset link has expired or was already used."), askAgain: t("Send a new link") }}>
        <AuthForm
          action={resetPasswordAction}
          submitLabel={t("Set new password")}
          pleaseWaitLabel={t("Saving…")}
          fields={[{ name: "password", label: t("New password"), type: "password", placeholder: t("At least 6 characters") }]}
        />
      </ResetLinkGate>
    </AuthShell>
  );
}
