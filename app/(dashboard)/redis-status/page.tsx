import { PageHeader } from "@/app/components/PageHeader";
import { Database } from "lucide-react";
import { RedisStatusClient } from "./RedisStatusClient";

export default function RedisStatusPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Database size={18} strokeWidth={1.8} />} title="Redis Connection Test" subtitle="Confirm Upstash genuinely connected hai ya nahi" />
      <RedisStatusClient />
    </div>
  );
}
