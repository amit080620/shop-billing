import Link from "@/lib/link";
import { Lock } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { homePathFor } from "@/lib/businessType";
import { getTranslator } from "@/lib/i18n/server";
import { STAFF_AREAS } from "@/lib/staffAccess";

/** Where a staff member lands on a screen the owner hasn't given them (lib/staffAccess). */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await requireSession();
  const { t } = await getTranslator();
  const from = (await searchParams).from ?? "";
  const area = STAFF_AREAS.find((a) => a.prefixes.some((p) => from === p || from.startsWith(p + "/")));
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Lock size={22} />
      </span>
      <h1 className="text-lg font-semibold text-foreground">{t("Not open for your account")}</h1>
      <p className="text-sm text-muted">
        {area ? t("“{area}” isn't turned on for you.", { area: t(area.label) }) + " " : ""}
        {t("Ask the shop owner to switch it on under Staff → Permissions.")}
      </p>
      <Link href={homePathFor(session.businessType, session.fastBillingEnabled)} className="btn-primary-sm mt-2">
        {t("Go to billing")}
      </Link>
    </div>
  );
}
