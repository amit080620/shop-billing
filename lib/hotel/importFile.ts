// The hotel's Excel file: rooms and upcoming bookings, read back into rows the server checks again;
// and the exports. Takes the xlsx module as an argument so it loads only when used. Parsing is pure.
import { BOOKING_SOURCES, MEAL_PLANS } from "./constants";
import { isIsoDate } from "./dates";

type XLSXModule = typeof import("xlsx");

export const ROOMS_SHEET = "Rooms";
export const BOOKINGS_SHEET = "Bookings";

type Column = { key: string; header: string; hint: string; required?: boolean };

export const ROOM_COLUMNS: Column[] = [
  { key: "type", header: "Room type", hint: "e.g. Deluxe AC. A new name makes a new room type.", required: true },
  { key: "rate", header: "Rate per night", hint: "Before GST, in rupees. Needed for a new room type.", required: true },
  { key: "numbers", header: "Room numbers", hint: "e.g. 101-110 or 101, 102, 105", required: true },
  { key: "floor", header: "Floor", hint: "Optional" },
  { key: "maxAdults", header: "Adults per room", hint: "Optional, 2 if blank" },
  { key: "maxChildren", header: "Children per room", hint: "Optional, 1 if blank" },
  { key: "gst", header: "GST %", hint: "Optional. Blank uses the standard rate for the tariff." },
  { key: "amenities", header: "Amenities", hint: "Optional, e.g. AC, TV, Wi-Fi" },
];

export const BOOKING_COLUMNS: Column[] = [
  { key: "guest", header: "Guest name", hint: "Who is staying", required: true },
  { key: "phone", header: "Mobile", hint: "Optional" },
  { key: "checkIn", header: "Check-in", hint: "Date, e.g. 25/12/2026. Today or later.", required: true },
  { key: "checkOut", header: "Check-out", hint: "Date, after check-in", required: true },
  { key: "type", header: "Room type", hint: "As in your hotel, e.g. Deluxe AC", required: true },
  { key: "rooms", header: "Rooms", hint: "How many, 1 if blank" },
  { key: "rate", header: "Rate per night", hint: "Blank uses the room type's rate" },
  { key: "adults", header: "Adults", hint: "2 if blank" },
  { key: "children", header: "Children", hint: "0 if blank" },
  { key: "source", header: "Source", hint: `Blank is Phone call. One of: ${BOOKING_SOURCES.map((s) => s.label).join(", ")}` },
  { key: "ref", header: "Booking ID", hint: "The site's own ID, if any" },
  { key: "commission", header: "Commission %", hint: "For a booking site or agent" },
  { key: "meal", header: "Meal plan", hint: "EP, CP, MAP or AP. EP if blank." },
  { key: "advance", header: "Advance", hint: "Already received, in rupees" },
  { key: "advanceMode", header: "Advance mode", hint: "Cash, Card, UPI, Online or Other. Cash if blank." },
];

export type SheetRow = { row: number; cells: Record<string, string> };

export type ParsedRoomRow = { type: string; rate: number | null; numbers: string; floor: string; maxAdults: number; maxChildren: number; gst: number | null; amenities: string };
export type ParsedBookingRow = { guest: string; phone: string; checkIn: string; checkOut: string; type: string; rooms: number; rate: number | null; adults: number; children: number; source: string; ref: string; commission: number; meal: string; advance: number; advanceMode: string };

const num = (v: string | undefined) => {
  const s = (v ?? "").replace(/[,₹\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** A date cell: 2026-12-25, 25/12/2026, 25-12-26, or an Excel day number. */
export function parseSheetDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (isIsoDate(s)) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseRoomRow(cells: Record<string, string>): { item?: ParsedRoomRow; problems: string[] } {
  const problems: string[] = [];
  const type = (cells.type ?? "").trim();
  if (!type) problems.push("Room type is empty");
  if (type.length > 60) problems.push("Room type is too long");
  const numbers = (cells.numbers ?? "").trim();
  const rate = num(cells.rate);
  if (rate !== null && (Number.isNaN(rate) || rate < 0)) problems.push("Rate per night isn't a number");
  const gst = num(cells.gst);
  if (gst !== null && (Number.isNaN(gst) || gst < 0 || gst > 40)) problems.push("GST % should be between 0 and 40");
  const maxAdults = num(cells.maxAdults) ?? 2;
  if (!(maxAdults >= 1 && maxAdults <= 20)) problems.push("Adults per room should be between 1 and 20");
  const maxChildren = num(cells.maxChildren) ?? 1;
  if (!(maxChildren >= 0 && maxChildren <= 20)) problems.push("Children per room should be between 0 and 20");
  if (problems.length) return { problems };
  return { item: { type, rate, numbers, floor: (cells.floor ?? "").trim(), maxAdults: Math.floor(maxAdults), maxChildren: Math.floor(maxChildren), gst, amenities: (cells.amenities ?? "").trim() }, problems };
}

const sourceFor = (raw: string) => {
  const s = raw.trim().toLowerCase();
  return BOOKING_SOURCES.find((x) => x.label.toLowerCase() === s || x.value === s)?.value ?? null;
};
const MODES: Record<string, string> = { cash: "cash", card: "card", upi: "upi", online: "online", other: "other" };

export function parseBookingRow(cells: Record<string, string>): { item?: ParsedBookingRow; problems: string[] } {
  const problems: string[] = [];
  const guest = (cells.guest ?? "").trim();
  if (!guest) problems.push("Guest name is empty");
  const checkIn = parseSheetDate(cells.checkIn);
  const checkOut = parseSheetDate(cells.checkOut);
  if (!checkIn) problems.push("Check-in isn't a date");
  if (!checkOut) problems.push("Check-out isn't a date");
  if (checkIn && checkOut && checkOut <= checkIn) problems.push("Check-out must be after check-in");
  const type = (cells.type ?? "").trim();
  if (!type) problems.push("Room type is empty");
  const rooms = num(cells.rooms) ?? 1;
  if (!(rooms >= 1 && rooms <= 20)) problems.push("Rooms should be between 1 and 20");
  const rate = num(cells.rate);
  if (rate !== null && (Number.isNaN(rate) || rate < 0)) problems.push("Rate per night isn't a number");
  const adults = num(cells.adults) ?? 2;
  const children = num(cells.children) ?? 0;
  if (!(adults >= 1 && adults <= 60)) problems.push("Adults should be between 1 and 60");
  if (!(children >= 0 && children <= 60)) problems.push("Children should be between 0 and 60");
  const source = (cells.source ?? "").trim() ? sourceFor(cells.source) : "phone";
  if (!source) problems.push(`Source "${cells.source}" isn't one of the list`);
  const commission = num(cells.commission) ?? 0;
  if (!(commission >= 0 && commission <= 100)) problems.push("Commission should be between 0 and 100");
  const meal = (cells.meal ?? "").trim().toUpperCase() || "EP";
  if (!MEAL_PLANS.some((m) => m.value === meal)) problems.push("Meal plan should be EP, CP, MAP or AP");
  const advance = num(cells.advance) ?? 0;
  if (!(advance >= 0)) problems.push("Advance isn't a number");
  const advanceMode = MODES[(cells.advanceMode ?? "").trim().toLowerCase() || "cash"];
  if (!advanceMode) problems.push("Advance mode should be Cash, Card, UPI, Online or Other");
  if (problems.length) return { problems };
  return { item: { guest, phone: (cells.phone ?? "").trim(), checkIn: checkIn as string, checkOut: checkOut as string, type, rooms: Math.floor(rooms), rate, adults: Math.floor(adults), children: Math.floor(children), source: source as string, ref: (cells.ref ?? "").trim(), commission, meal, advance, advanceMode }, problems };
}

function sheetFor(XLSX: XLSXModule, columns: Column[], samples: Record<string, string | number>[]) {
  const ws = XLSX.utils.aoa_to_sheet([columns.map((c) => (c.required ? `${c.header} *` : c.header)), ...samples.map((s) => columns.map((c) => s[c.key] ?? ""))]);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, c.header.length + 3) }));
  return ws;
}

/** The template: rooms, upcoming bookings, and how to fill them. */
export function hotelTemplate(XLSX: XLSXModule) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFor(XLSX, ROOM_COLUMNS, [{ type: "Deluxe AC", rate: 2500, numbers: "101-110", floor: "1", maxAdults: 2, maxChildren: 1, amenities: "AC, TV, Wi-Fi" }, { type: "Suite", rate: 5500, numbers: "201, 202", floor: "2", maxAdults: 3 }]), ROOMS_SHEET);
  XLSX.utils.book_append_sheet(wb, sheetFor(XLSX, BOOKING_COLUMNS, [{ guest: "Rohan Mehta", phone: "9876543210", checkIn: "25/12/2026", checkOut: "27/12/2026", type: "Deluxe AC", rooms: 1, source: "MakeMyTrip", ref: "NH123456", commission: 15, advance: 1000, advanceMode: "UPI" }]), BOOKINGS_SHEET);
  const how = XLSX.utils.aoa_to_sheet([
    ["How to fill this file"],
    [`1. Fill "${ROOMS_SHEET}" to set up your rooms, "${BOOKINGS_SHEET}" to bring in upcoming bookings, or both. Delete the example rows first.`],
    ["2. Room numbers already in your hotel are left as they are."],
    ["3. A booking already here (same guest and dates) is left out, so importing the same file twice is safe."],
    ["4. Rooms in bookings are picked at check-in. Past bookings can't be brought in."],
    ["5. Don't change the words in the top row. You may delete columns you don't need."],
    [],
    ["Sheet", "Column", "What to put"],
    ...ROOM_COLUMNS.map((c) => [ROOMS_SHEET, c.header, c.hint]),
    ...BOOKING_COLUMNS.map((c) => [BOOKINGS_SHEET, c.header, c.hint]),
  ]);
  how["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, how, "How to fill");
  return wb;
}

function read(XLSX: XLSXModule, wb: ReturnType<XLSXModule["read"]>, sheet: string, columns: Column[]): SheetRow[] {
  const ws = wb.Sheets[sheet];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  const header = (raw[0] ?? []).map((h) => String(h).replace(/\*/g, "").trim().toLowerCase());
  const keys = header.map((h) => columns.find((c) => c.header.toLowerCase() === h)?.key ?? null);
  const rows: SheetRow[] = [];
  raw.slice(1).forEach((line, i) => {
    const cells: Record<string, string> = {};
    (line as unknown[]).forEach((v, c) => {
      const key = keys[c];
      if (key) cells[key] = typeof v === "number" ? String(v) : String(v ?? "").trim();
    });
    if (Object.values(cells).some(Boolean)) rows.push({ row: i + 2, cells });
  });
  return rows;
}

/** The owner's file as rows for the server. A sheet named differently isn't read. */
export function readHotelFile(XLSX: XLSXModule, data: ArrayBuffer): { rooms: SheetRow[]; bookings: SheetRow[] } {
  const wb = XLSX.read(data, { type: "array" });
  return { rooms: read(XLSX, wb, ROOMS_SHEET, ROOM_COLUMNS), bookings: read(XLSX, wb, BOOKINGS_SHEET, BOOKING_COLUMNS) };
}

export type HotelExport = { sheet: string; headers: string[]; rows: (string | number | null)[][] }[];

export function hotelExportBook(XLSX: XLSXModule, sheets: HotelExport) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows.map((r) => r.map((v) => v ?? ""))]);
    ws["!cols"] = s.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.sheet);
  }
  return wb;
}
