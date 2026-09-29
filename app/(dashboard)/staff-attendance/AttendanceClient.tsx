"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllPresentAction, markAttendanceAction } from "@/lib/actions/payroll";
import { useT } from "@/lib/i18n/LangContext";

type Status = "present" | "half" | "absent" | "leave" | "off";

const CHOICES: { key: Status; label: string; on: string }[] = [
  { key: "present", label: "P", on: "border-success bg-success text-white" },
  { key: "half", label: "½", on: "border-credit bg-credit text-white" },
  { key: "absent", label: "A", on: "border-danger bg-danger text-white" },
  { key: "leave", label: "Leave", on: "border-brand bg-brand text-white" },
  { key: "off", label: "Off", on: "border-muted bg-muted text-white" },
];

/** One day's register: a tap marks, a second tap on the same mark clears it. */
export function AttendanceClient({ date, workers, marks: initial }: { date: string; workers: { id: string; name: string; designation: string | null }[]; marks: Record<string, Status> }) {
  const { t } = useT();
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Status | undefined>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mark(workerId: string, status: Status) {
    const next = marks[workerId] === status ? null : status;
    setMarks((m) => ({ ...m, [workerId]: next ?? undefined }));
    setError(null);
    start(async () => {
      const r = await markAttendanceAction(workerId, date, next);
      if (r.error) {
        setError(r.error);
        router.refresh();
      }
    });
  }

  const count = (s: Status) => Object.values(marks).filter((m) => m === s).length;
  const unmarked = workers.filter((w) => !marks[w.id]).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {t("Present")} {count("present")} · {t("Half")} {count("half")} · {t("Absent")} {count("absent")} · {t("Leave")} {count("leave")}
          {unmarked > 0 ? ` · ${t("Not marked")} ${unmarked}` : ""}
        </span>
        {unmarked > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await markAllPresentAction(date);
                if (r.error) setError(r.error);
                router.refresh();
              })
            }
            className="shrink-0 rounded-full border border-success px-3 py-1 text-xs font-medium text-success disabled:opacity-60"
          >
            {t("Rest present")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <ul className="flex flex-col gap-2">
        {workers.map((w) => (
          <li key={w.id} className="neu-card flex flex-col gap-2 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">{w.name}</p>
              {w.designation && <p className="shrink-0 text-xs text-muted">{w.designation}</p>}
            </div>
            <div className="flex gap-1.5">
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => mark(w.id, c.key)}
                  aria-pressed={marks[w.id] === c.key}
                  className={`flex-1 rounded-lg border px-1 py-1.5 text-xs font-semibold ${marks[w.id] === c.key ? c.on : "border-border text-muted"}`}
                >
                  {c.key === "leave" || c.key === "off" ? t(c.label) : c.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted">{t("Monthly salary: a day not marked counts as worked — mark only who didn't come. Daily wage: only days marked P or ½ are paid.")}</p>
    </div>
  );
}
