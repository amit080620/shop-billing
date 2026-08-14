import Link from "next/link";
import { Lock } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/modules";

export function ModuleBlocked({ moduleKey }: { moduleKey: ModuleKey }) {
  const moduleInfo = MODULES.find((m) => m.key === moduleKey);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/15 text-muted">
        <Lock size={26} />
      </span>
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
