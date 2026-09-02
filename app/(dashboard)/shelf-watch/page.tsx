import { PageHeader } from "@/app/components/PageHeader";
import { Eye } from "lucide-react";
import { ShelfWatchClient } from "./ShelfWatchClient";
import { getShelfWatchesAction } from "@/lib/actions/shelfWatch";

export default async function ShelfWatchPage() {
  const shelves = await getShelfWatchesAction();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Eye size={18} strokeWidth={1.8} />} title="Ankhon se Inventory" subtitle="Shelf ki photo kheenchein, AI batayega kya kam ho raha hai" />
      <ShelfWatchClient initialShelves={shelves} />
    </div>
  );
}
