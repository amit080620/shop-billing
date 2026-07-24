"use client";

function toIcsDate(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function downloadFestivalReminder(festivalName: string, festivalDate: Date, prepHints: string[]) {
  const reminderDate = new Date(festivalDate);
  reminderDate.setDate(reminderDate.getDate() - 18); // ~18 days before, mid-way through the 15–20 day window

  const endDate = new Date(reminderDate);
  endDate.setDate(endDate.getDate() + 1);

  const description = `Start stocking up for ${festivalName} (${festivalDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}). Consider: ${prepHints.join(", ")}.`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shop Billing//Festival Planner//EN",
    "BEGIN:VEVENT",
    `UID:festival-${toIcsDate(festivalDate)}-${Date.now()}@shop-billing`,
    `DTSTAMP:${toIcsDate(new Date())}T000000Z`,
    `DTSTART;VALUE=DATE:${toIcsDate(reminderDate)}`,
    `DTEND;VALUE=DATE:${toIcsDate(endDate)}`,
    `SUMMARY:Restock for ${festivalName}`,
    `DESCRIPTION:${description.replace(/,/g, "\\,")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `restock-${festivalName.replace(/[^a-zA-Z0-9]+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
