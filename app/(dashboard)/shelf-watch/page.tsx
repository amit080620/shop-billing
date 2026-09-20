import { PageHeader } from "@/app/components/PageHeader";
import { Eye } from "lucide-react";
import { ShelfWatchClient } from "./ShelfWatchClient";
import { getShelfWatchesAction } from "@/lib/actions/shelfWatch";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";

export default async function ShelfWatchPage() {
  const { t } = await getTranslator();
  const shelves = await getShelfWatchesAction();
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader icon={<Eye size={18} strokeWidth={1.8} />} title={t("Shelf watch")} subtitle="Take a photo of a shelf; AI tells you what is running low" />
      <ShelfWatchClient initialShelves={shelves} />
    </div>
  );
}
