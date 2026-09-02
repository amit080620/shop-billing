import { PageHeader } from "@/app/components/PageHeader";
import { AlertOctagon } from "lucide-react";
import { ProfitLeakClient } from "./ProfitLeakClient";

export default function ProfitLeakPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<AlertOctagon size={18} strokeWidth={1.8} />} title="Profit Leak Detector" subtitle="Aapka paisa abhi kahan phansa hai" />
      <ProfitLeakClient />
    </div>
  );
}
