import { requireSession } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { ShopHighlightClient } from "./ShopHighlightClient";
import { Sparkles } from "lucide-react";

export default async function ShopHighlightPage() {
  const session = await requireSession();
  const { t } = await getTranslator();

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("Today's highlight")}
        subtitle={t("A shareable card for your WhatsApp Status or Instagram Story")}
        icon={<Sparkles size={18} strokeWidth={1.8} />}
      />
      <ShopHighlightClient shopName={session.shopName} />
    </div>
  );
}
