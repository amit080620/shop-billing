import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions/auth";
import { AuthShell } from "../AuthShell";
import { AuthForm } from "../AuthForm";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";

export default async function ResetPasswordPage() {
  const { lang } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={
        <Link href="/login" className="font-semibold text-brand">
          ← Back to login
        </Link>
      }
    >
      <AuthForm
        action={resetPasswordAction}
        submitLabel="Set new password"
        pleaseWaitLabel="Saving…"
        fields={[{ name: "password", label: "New password", type: "password", placeholder: "At least 6 characters" }]}
      />
    </AuthShell>
  );
}
