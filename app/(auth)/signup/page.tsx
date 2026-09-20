import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";
import { BUSINESS_TYPES } from "@/lib/businessType";
import { INDIAN_STATES } from "@/lib/constants/states";

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
            label: t("What kind of business is this?"),
            requiredMessage: t("Pick the kind of business — this can't be changed later."),
            type: "grid",
            gridOptions: BUSINESS_TYPES.map((b) => ({ value: b.value, label: b.label.split(" / ")[0], icon: b.value, colors: b.colors })),
          },
          {
            name: "stateCode",
            label: t("State"),
            type: "select",
            placeholder: "Choose your state",
            options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })),
          },
          { name: "ownerName", label: t("signup.ownerName"), type: "text", placeholder: "Rakesh Sharma" },
          { name: "email", label: t("auth.email"), type: "email", placeholder: "you@example.com" },
          { name: "password", label: t("auth.password"), type: "password", placeholder: "At least 6 characters" },
        ]}
      />
    </AuthShell>
  );
}
