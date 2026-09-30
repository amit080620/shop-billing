"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetEnquiryStatusAction } from "@/lib/actions/admin-plans";

// A support request moves new → working on it → resolved (or closed without a fix).
const STATES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Working on it" },
  { key: "won", label: "Resolved" },
  { key: "lost", label: "Closed" },
] as const;

export function SupportStatusButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="ml-auto flex flex-wrap gap-1">
      {STATES.map((s) => (
        <button
          key={s.key}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await adminSetEnquiryStatusAction(id, s.key);
              router.refresh();
            })
          }
          className={`rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60 ${status === s.key ? "border-white bg-gray-800 text-white" : "border-gray-700 text-gray-400"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
