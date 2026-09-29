import Link from "next/link";

/** Attendance · Salary · People — the three screens of staff attendance and pay. */
export function StaffTabs({ active, t }: { active: "attendance" | "salary" | "people"; t: (k: string) => string }) {
  const tabs = [
    { key: "attendance", href: "/staff-attendance", label: t("Attendance") },
    { key: "salary", href: "/staff-attendance/salary", label: t("Salary") },
    { key: "people", href: "/staff-attendance/people", label: t("People") },
  ] as const;
  return (
    <div role="tablist" className="flex gap-1 rounded-full border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium ${active === tab.key ? "bg-brand text-white" : "text-muted"}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
