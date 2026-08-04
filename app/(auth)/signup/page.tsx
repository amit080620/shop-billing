import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { BUSINESS_TYPES } from "@/lib/businessType";

export default async function SignupPage() {
  const { lang, t } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={
        <>
          {t("signup.alreadyHave")}{" "}
          <Link href="/login" className="font-semibold text-brand">
            {t("signup.login")}
          </Link>
        </>
      }
    >
      <AuthForm
        action={signupAction}
        submitLabel={t("signup.submit")}
        pleaseWaitLabel={t("auth.pleaseWait")}
        fields={[
          { name: "shopName", label: t("signup.shopName"), type: "text", placeholder: "Sharma General Store" },
          {
            name: "businessType",
            label: "What kind of business is this?",
            type: "select",
            placeholder: "Choose one",
            options: BUSINESS_TYPES.map((b) => ({ value: b.value, label: `${b.icon} ${b.label}` })),
          },
          { name: "ownerName", label: t("signup.ownerName"), type: "text", placeholder: "Rakesh Sharma" },
          { name: "email", label: t("auth.email"), type: "email", placeholder: "you@example.com" },
          { name: "password", label: t("auth.password"), type: "password", placeholder: "At least 6 characters" },
        ]}
      />
    </AuthShell>
  );
}
