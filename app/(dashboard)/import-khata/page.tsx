import { PageHeader } from "@/app/components/PageHeader";
import { BookOpenCheck } from "lucide-react";
import { KhataImportClient } from "./KhataImportClient";

export default function ImportKhataPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<BookOpenCheck size={18} strokeWidth={1.8} />} title="Import old khata" subtitle="Digitize your paper account book — free, uses AI" />
      <KhataImportClient />
    </div>
  );
}
