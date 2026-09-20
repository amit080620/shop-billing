"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetEnquiryStatusAction } from "@/lib/actions/admin-plans";

const STATES = ["new", "contacted", "won", "lost"] as const;

export function EnquiryStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="ml-auto flex gap-1">
      {STATES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await adminSetEnquiryStatusAction(id, s);
              router.refresh();
            })
          }
          className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize disabled:opacity-60 ${
            status === s ? "border-white bg-gray-800 text-white" : "border-gray-700 text-gray-400"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
