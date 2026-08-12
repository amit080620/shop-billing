import Link from "next/link";
import { MODULES, type ModuleKey } from "@/lib/modules";

export function ModuleBlocked({ moduleKey }: { moduleKey: ModuleKey }) {
  const moduleInfo = MODULES.find((m) => m.key === moduleKey);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <p className="text-3xl">🔒</p>
      <p className="text-sm font-medium text-foreground">{moduleInfo?.label ?? "This feature"} isn&apos;t enabled for your shop</p>
      <p className="max-w-sm text-sm text-muted">
        Contact support to add this to your plan.
      </p>
      <Link href="/more" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        Back to More
      </Link>
    </div>
  );
}
