"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { deleteCustomerAction } from "@/lib/actions/customers";

export function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete ${customerName}? This can't be undone.`)) return;
    setIsPending(true);
    setError(null);
    const result = await deleteCustomerAction(customerId);
    setIsPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/customers");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="flex items-center gap-1 text-xs font-medium text-muted hover:text-danger disabled:opacity-60"
      >
        <Trash2 size={13} /> {isPending ? "…" : t("common.delete")}
      </button>
      {error && <p className="max-w-[200px] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
