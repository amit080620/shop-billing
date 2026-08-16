"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkOutMemberAction } from "@/lib/actions/gym";

type Attendance = { id: string; memberName: string; checkedInAt: string; checkedOutAt: string | null };

export function AttendanceRow({ attendance }: { attendance: Attendance }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const inTime = new Date(attendance.checkedInAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

  return (
    <li className="flex items-center justify-between rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">{attendance.memberName}</p>
        <p className="text-xs text-muted">
          In: {inTime}
          {attendance.checkedOutAt ? ` · Out: ${new Date(attendance.checkedOutAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </div>
      {!attendance.checkedOutAt && (
        <button
          onClick={() =>
            startTransition(async () => {
              await checkOutMemberAction(attendance.id);
              router.refresh();
            })
          }
          disabled={isPending}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground disabled:opacity-60"
        >
          Check out
        </button>
      )}
    </li>
  );
}
