import Link from "next/link";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { AuthShell } from "../AuthShell";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { PasswordHelpForm } from "./PasswordHelpForm";

export default async function ForgotPasswordPage() {
  const { lang, t } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title={t("Reset your password")}
      subtitle={t("Enter your email and we'll send you a link to set a new password.")}
      footer={
        <Link href="/login" className="font-semibold text-brand">
          ← {t("Back to login")}
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <ForgotPasswordForm action={forgotPasswordAction} />
        <PasswordHelpForm
          words={{
            open: t("Email didn't come? Ask The Ray team"),
            intro: t("Give your login email and mobile number. Our team will reset your password and call you."),
            email: t("Login email"),
            phone: t("Mobile number"),
            send: t("Ask for a call"),
            sending: t("Sending…"),
            sent: t("Sent. Our team will reset your password and call you on this number."),
          }}
        />
      </div>
    </AuthShell>
  );
}
