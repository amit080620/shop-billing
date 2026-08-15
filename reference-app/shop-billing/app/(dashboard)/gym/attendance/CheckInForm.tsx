"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInMemberAction } from "@/lib/actions/gym";
import { CheckCircle2 } from "lucide-react";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";

type Member = { id: string; name: string; phone: string };

export function CheckInForm({ lang, members }: { lang: Lang; members: Member[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-brand-text"><CheckCircle2 size={14} /> Check in a member</p>
      <SearchableSelect
        lang={lang}
        items={members}
        getKey={(m) => m.id}
        getLabel={(m) => m.name}
        getSubLabel={(m) => m.phone}
        onSelect={(m) => {
          setError(null);
          setSuccess(null);
          startTransition(async () => {
            const result = await checkInMemberAction(m.id);
            if (result.error) {
              setError(result.error);
              return;
            }
            setSuccess(`${m.name} checked in`);
            router.refresh();
          });
        }}
        placeholder="Search member name or phone…"
      />
      {isPending && <p className="text-xs text-brand-text">Checking in…</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-brand-text">{success}</p>}
    </div>
  );
}
