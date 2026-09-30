"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { useT } from "@/lib/i18n/LangContext";

/** "Add money for…": pick the customer, land on their page where the balance is. */
export function CustomerJump({ customers }: { customers: { id: string; name: string; phone: string | null }[] }) {
  const { t, lang } = useT();
  const router = useRouter();
  return (
    <SearchableSelect
      lang={lang}
      items={customers}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getSubLabel={(c) => c.phone ?? ""}
      onSelect={(c) => router.push(`/customers/${c.id}`)}
      placeholder={t("Add money for… (search a customer)")}
    />
  );
}
