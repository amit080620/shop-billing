import Link from "next/link";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { AuthShell } from "../AuthShell";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const { lang } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      footer={
        <Link href="/login" className="font-semibold text-brand">
          ← Back to login
        </Link>
      }
    >
      <ForgotPasswordForm action={forgotPasswordAction} />
    </AuthShell>
  );
}
