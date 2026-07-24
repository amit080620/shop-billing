import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";
import { getTranslator } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme";

export default async function LoginPage() {
  const { lang, t } = await getTranslator();
  const theme = await getTheme();

  return (
    <AuthShell
      lang={lang}
      theme={theme}
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          {t("login.newShop")}{" "}
          <Link href="/signup" className="font-semibold text-brand">
            {t("login.setOneUp")}
          </Link>
        </>
      }
    >
      <AuthForm
        action={loginAction}
        submitLabel={t("login.submit")}
        pleaseWaitLabel={t("auth.pleaseWait")}
        fields={[
          { name: "email", label: t("auth.email"), type: "email", placeholder: "you@example.com" },
          { name: "password", label: t("auth.password"), type: "password" },
        ]}
      />
    </AuthShell>
  );
}
