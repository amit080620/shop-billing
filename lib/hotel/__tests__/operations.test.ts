import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { nightRate, occupancyByDate, quoteStay, weekdayOf, type RateRule } from "../rates";
import { buildIcal, closedRanges, icalUrlProblem, parseIcal } from "../ical";
import { auditIssues, flashMessage, flashTotal, receivedTotal, type FlashFigures } from "../flash";
import { hkNext, hkNormal, hkReady } from "../housekeeping";
import { eventAmounts, eventLines, eventsClash } from "../events";
import { availabilityByType, freeRooms } from "../availability";
import { hotelExportBook, hotelTemplate, parseBookingRow, parseRoomRow, parseSheetDate, readHotelFile } from "../importFile";

const rule = (over: Partial<RateRule>): RateRule => ({ id: "r", name: "Rule", roomTypeId: null, startDate: null, endDate: null, weekdays: null, kind: "percent", value: 0, minOccupancy: null, minStay: null, closedToArrival: false, isActive: true, ...over });
// 2026-12-25 is a Friday.
const FRI = "2026-12-25";

describe("rate rules", () => {
  it("knows the weekday of a date", () => {
    expect(weekdayOf(FRI)).toBe(5);
  });

  it("leaves the base rate alone with no rule, and ignores a rule that is off, another type's or out of dates", () => {
    const rules = [rule({ value: 50, isActive: false }), rule({ value: 50, roomTypeId: "other" }), rule({ value: 50, startDate: "2027-01-01" }), rule({ value: 50, weekdays: [1] })];
    expect(nightRate({ baseRate: 2000, typeId: "t", date: FRI, occupancyPercent: 0, rules })).toEqual({ rate: 2000, applied: [] });
  });

  it("adds % and amount rules on the base", () => {
    const n = nightRate({ baseRate: 2000, typeId: "t", date: FRI, occupancyPercent: 0, rules: [rule({ name: "Weekend", value: 20, weekdays: [5, 6] }), rule({ name: "Fee", kind: "amount", value: 100 })] });
    expect(n.rate).toBe(2500);
    expect(n.applied).toEqual(["Weekend", "Fee"]);
  });

  it("lets a set rate replace the base, the one over the fewest dates winning, with % on top", () => {
    const rules = [rule({ name: "Season", kind: "set", value: 3000, startDate: "2026-12-01", endDate: "2026-12-31" }), rule({ name: "Xmas", kind: "set", value: 5000, startDate: FRI, endDate: "2026-12-26" }), rule({ name: "Up", value: 10 })];
    const n = nightRate({ baseRate: 2000, typeId: "t", date: FRI, occupancyPercent: 0, rules });
    expect(n.rate).toBe(5500);
    expect(n.applied).toEqual(["Xmas", "Up"]);
  });

  it("counts an occupancy rule only when the night is that full", () => {
    const rules = [rule({ value: 25, minOccupancy: 80 })];
    expect(nightRate({ baseRate: 2000, typeId: "t", date: FRI, occupancyPercent: 79, rules }).rate).toBe(2000);
    expect(nightRate({ baseRate: 2000, typeId: "t", date: FRI, occupancyPercent: 80, rules }).rate).toBe(2500);
  });

  it("never goes below zero", () => {
    expect(nightRate({ baseRate: 100, typeId: "t", date: FRI, occupancyPercent: 0, rules: [rule({ kind: "amount", value: -500 })] }).rate).toBe(0);
  });

  it("quotes a stay at the average of its nights, and says when the stay is too short or arrivals are closed", () => {
    const q = quoteStay({ baseRate: 2000, typeId: "t", checkIn: "2026-12-24", checkOut: "2026-12-26", occupancy: () => 0, rules: [rule({ name: "Fri", value: 50, weekdays: [5] }), rule({ name: "Long", minStay: 3 }), rule({ name: "Shut", closedToArrival: true, startDate: "2026-12-24", endDate: "2026-12-24" })] });
    expect(q.nightly.map((n) => n.rate)).toEqual([2000, 3000]);
    expect(q.average).toBe(2500);
    expect(q.minStayShort).toBe(3);
    expect(q.closedToArrival).toBe("Shut");
  });

  it("works out how full each night is, from rooms in service", () => {
    const o = occupancyByDate({ rooms: [{ isBlocked: false }, { isBlocked: false }, { isBlocked: true }], booked: [{ checkIn: "2026-12-25", checkOut: "2026-12-27" }], from: "2026-12-25", days: 3 });
    expect([...o.values()]).toEqual([50, 50, 0]);
  });
});

describe("iCal", () => {
  const FEED = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:a@x", "DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261227", "SUMMARY:Reserved", "END:VEVENT", "BEGIN:VEVENT", "UID:b@x", "STATUS:CANCELLED", "DTSTART;VALUE=DATE:20261201", "DTEND;VALUE=DATE:20261202", "END:VEVENT", "BEGIN:VEVENT", "UID:c@x", "DTSTART:20261230T140000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

  it("reads stays, leaves cancelled ones out, and takes a missing end as one night", () => {
    const events = parseIcal(FEED);
    expect(events.map((e) => [e.uid, e.start, e.end])).toEqual([["a@x", "2026-12-25", "2026-12-27"], ["c@x", "2026-12-30", "2026-12-31"]]);
  });

  it("joins full days into ranges", () => {
    const full = new Set(["2026-12-25", "2026-12-26", "2026-12-28"]);
    expect(closedRanges({ from: "2026-12-24", days: 7, isFull: (d) => full.has(d) })).toEqual([{ start: "2026-12-25", end: "2026-12-27" }, { start: "2026-12-28", end: "2026-12-29" }]);
  });

  it("writes a calendar it can read back, with no guest's details", () => {
    const text = buildIcal({ name: "Hotel, Deluxe", domain: "x.app", ranges: [{ start: "2026-12-25", end: "2026-12-27" }], now: new Date("2026-11-05T00:00:00Z") });
    expect(parseIcal(text).map((e) => [e.start, e.end])).toEqual([["2026-12-25", "2026-12-27"]]);
    expect(text).toContain("BEGIN:VCALENDAR");
  });

  it("refuses links that aren't public https", () => {
    for (const bad of ["http://airbnb.com/a.ics", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://192.168.1.1/a", "https://169.254.169.254/latest", "https://[::1]/a", "nonsense"]) expect(icalUrlProblem(bad), bad).not.toBeNull();
    expect(icalUrlProblem("https://www.airbnb.com/calendar/ical/1.ics")).toBeNull();
  });
});

describe("dates a site has sold take a room", () => {
  const rooms = [{ id: "1", roomTypeId: "t", isBlocked: false }, { id: "2", roomTypeId: "t", isBlocked: false }];
  const sold = { bookingId: "ical:x", roomTypeId: "t", roomId: null, checkIn: "2026-12-25", checkOut: "2026-12-27" };

  it("counts against the type's stock, but leaves every room number pickable", () => {
    expect(availabilityByType({ rooms, booked: [sold], checkIn: "2026-12-26", checkOut: "2026-12-28" }).t.available).toBe(1);
    expect(availabilityByType({ rooms, booked: [sold], checkIn: "2026-12-27", checkOut: "2026-12-28" }).t.available).toBe(2);
    expect(freeRooms({ rooms, booked: [sold], checkIn: "2026-12-26", checkOut: "2026-12-28" })).toHaveLength(2);
  });
});

describe("housekeeping", () => {
  it("sells a room only when clean or inspected", () => {
    expect(["dirty", "cleaning", "clean", "inspected"].map(hkReady)).toEqual([false, false, true, true]);
    expect(["dirty", "cleaning", "clean", "inspected"].map(hkNormal)).toEqual(["dirty", "dirty", "clean", "clean"]);
  });
  it("offers the next steps", () => {
    expect(hkNext("dirty")).toEqual(["cleaning", "clean"]);
    expect(hkNext("cleaning")).toEqual(["clean"]);
    expect(hkNext("clean")).toEqual(["inspected", "dirty"]);
    expect(hkNext("inspected")).toEqual(["dirty"]);
  });
});

describe("flash report", () => {
  const f: FlashFigures = { date: "2026-12-25", occupancyPercent: 80, roomNights: 8, roomsInService: 10, adr: 2500, revPar: 2000, roomRevenue: 20000, extrasRevenue: 500, roomServiceRevenue: 1500, eventRevenue: 0, received: { cash: 5000, upi: 15000, card: 0 }, cancelled: 1, noShows: 0, commission: 300, arrivalsTomorrow: 2, departuresTomorrow: 3, nextWeekOccupancy: [{ date: "2026-12-26", percent: 50 }, { date: "2026-12-27", percent: 70 }] };
  it("adds up", () => {
    expect(flashTotal(f)).toBe(22000);
    expect(receivedTotal(f)).toBe(20000);
  });
  it("makes the message, leaving out what is nil", () => {
    const m = flashMessage(f, "Hotel Ray");
    expect(m).toContain("Hotel Ray");
    expect(m).toContain("Occupancy 80% (8/10 rooms)");
    expect(m).toContain("Next 7 nights 60% booked");
    expect(m).not.toContain("Events");
    expect(m).not.toContain("card");
  });
  it("lists only what needs attention", () => {
    expect(auditIssues({ lateArrivals: 1, arrivalsPending: 2, overstays: 0, departuresPending: 0, roomsToClean: 0, urgentTickets: 1, newRequests: 0 }).map((i) => [i.key, i.count])).toEqual([["late_arrivals", 3], ["urgent_tickets", 1]]);
  });
});

describe("banquet", () => {
  const e = { hallRent: 50000, plates: 200, plateRate: 500, decoration: 20000, otherAmount: 0, otherLabel: "", gstPercent: 18, eventName: "Wedding" };
  it("makes a line for each amount, leaving out what is nil", () => {
    expect(eventLines(e).map((l) => [l.quantity, l.unitPrice])).toEqual([[1, 50000], [200, 500], [1, 20000]]);
    expect(eventLines({ ...e, plates: 200, plateRate: 0, decoration: 0 })).toHaveLength(1);
  });
  it("adds them up with GST", () => {
    expect(eventAmounts(e)).toEqual({ taxable: 170000, gst: 30600, total: 200600 });
  });
  it("lets morning and evening share a hall, but not with a full day", () => {
    expect(eventsClash("morning", "evening")).toBe(false);
    expect(eventsClash("morning", "morning")).toBe(true);
    expect(eventsClash("full_day", "evening")).toBe(true);
  });
});

describe("the hotel's Excel file", () => {
  it("reads dates as Indians write them, and Excel's day numbers", () => {
    expect(parseSheetDate("25/12/2026")).toBe("2026-12-25");
    expect(parseSheetDate("25-12-26")).toBe("2026-12-25");
    expect(parseSheetDate("2026-12-25")).toBe("2026-12-25");
    expect(parseSheetDate("46381")).toBe("2026-12-25");
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("soon")).toBeNull();
  });

  it("checks a room row", () => {
    expect(parseRoomRow({ type: "Deluxe", rate: "2,500", numbers: "101-105" }).item).toMatchObject({ type: "Deluxe", rate: 2500, numbers: "101-105", maxAdults: 2, maxChildren: 1, gst: null });
    expect(parseRoomRow({ rate: "abc", gst: "99", numbers: "1" }).problems).toEqual(["Room type is empty", "Rate per night isn't a number", "GST % should be between 0 and 40"]);
  });

  it("checks a booking row, listing every problem", () => {
    expect(parseBookingRow({ guest: "Rohan", checkIn: "25/12/2026", checkOut: "27/12/2026", type: "Deluxe", source: "MakeMyTrip", advance: "1000", advanceMode: "UPI" }).item).toMatchObject({ guest: "Rohan", checkIn: "2026-12-25", checkOut: "2026-12-27", rooms: 1, adults: 2, source: "makemytrip", meal: "EP", advance: 1000, advanceMode: "upi" });
    const bad = parseBookingRow({ guest: "", checkIn: "27/12/2026", checkOut: "25/12/2026", type: "D", source: "Nowhere", meal: "XX", advanceMode: "cheque" }).problems;
    expect(bad).toEqual(["Guest name is empty", "Check-out must be after check-in", 'Source "Nowhere" isn\'t one of the list', "Meal plan should be EP, CP, MAP or AP", "Advance mode should be Cash, Card, UPI, Online or Other"]);
  });

  it("reads its own template back", () => {
    const data = XLSX.write(hotelTemplate(XLSX), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { rooms, bookings } = readHotelFile(XLSX, data);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].row).toBe(2);
    expect(parseRoomRow(rooms[0].cells).item).toMatchObject({ type: "Deluxe AC", rate: 2500, numbers: "101-110" });
    expect(parseBookingRow(bookings[0].cells).item).toMatchObject({ guest: "Rohan Mehta", source: "makemytrip", commission: 15 });
  });

  it("builds the export's sheets", () => {
    const wb = hotelExportBook(XLSX, [{ sheet: "Rooms", headers: ["A"], rows: [["x"], [null]] }]);
    expect(wb.SheetNames).toEqual(["Rooms"]);
  });
});
