// iCal: the one calendar link booking sites such as Airbnb and some Booking.com properties share
// without a paid connection. Reads the dates a site has sold; writes the dates a room type is full,
// for the site to read. It updates when a site refreshes (often hours), so it lowers overbooking but
// doesn't end it. Pure.
import { addDays } from "./dates";

export type IcalEvent = { uid: string; start: string; end: string; summary: string };

/** Lines folded by the iCal format back into one. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

/** A DTSTART or DTEND value as an ISO date. Times are taken by their own date. */
function toDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The events of a calendar: those with a start, ending on the day after their last night. Cancelled
 * events are left out; an event with no end is one night. */
export function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  let cur: Partial<IcalEvent> & { cancelled?: boolean } = {};
  let inside = false;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      inside = true;
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      inside = false;
      if (cur.start && !cur.cancelled) {
        const end = cur.end && cur.end > cur.start ? cur.end : addDays(cur.start, 1);
        events.push({ uid: cur.uid ?? `${cur.start}-${end}-${cur.summary ?? ""}`, start: cur.start, end, summary: (cur.summary ?? "").slice(0, 120) });
      }
      continue;
    }
    if (!inside) continue;
    const at = line.indexOf(":");
    if (at < 0) continue;
    const name = line.slice(0, at).split(";")[0].toUpperCase();
    const value = line.slice(at + 1);
    if (name === "UID") cur.uid = value.trim().slice(0, 200);
    else if (name === "SUMMARY") cur.summary = value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").trim();
    else if (name === "DTSTART") cur.start = toDate(value) ?? undefined;
    else if (name === "DTEND") cur.end = toDate(value) ?? undefined;
    else if (name === "STATUS" && value.trim().toUpperCase() === "CANCELLED") cur.cancelled = true;
  }
  return events;
}

const stamp = (date: string) => date.replace(/-/g, "");

/** A calendar of the given closed ranges, for a booking site to read. */
export function buildIcal(input: { name: string; domain: string; ranges: { start: string; end: string }[]; now: Date }): string {
  const dtstamp = input.now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Ray//Hotel//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${input.name.replace(/[,;\\\r\n]/g, " ")}`];
  for (const r of input.ranges) {
    lines.push("BEGIN:VEVENT", `UID:${stamp(r.start)}-${stamp(r.end)}@${input.domain}`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${stamp(r.start)}`, `DTEND;VALUE=DATE:${stamp(r.end)}`, "SUMMARY:Not available", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Days with no room left, joined into ranges. */
export function closedRanges(input: { from: string; days: number; isFull: (date: string) => boolean }): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let open: string | null = null;
  for (let i = 0; i <= input.days; i++) {
    const date = addDays(input.from, i);
    const full = i < input.days && input.isFull(date);
    if (full && open === null) open = date;
    if (!full && open !== null) {
      out.push({ start: open, end: date });
      open = null;
    }
  }
  return out;
}

/** A calendar link worth fetching: https, and not a private or local address. */
export function icalUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That doesn't look like a link.";
  }
  if (u.protocol !== "https:") return "Use the https:// calendar link the site gives you.";
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":") ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^\d+$/.test(host);
  return isPrivate ? "That address can't be used." : null;
}
