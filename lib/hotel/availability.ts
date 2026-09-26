import { stayOverlaps } from "./dates";

export type RoomLite = { id: string; roomTypeId: string; isBlocked: boolean };

/** A room on an active (reserved or in-house) booking. `roomId` is null until
 * a specific room has been assigned — it still uses up one room of its type. */
export type BookedRoomLite = {
  bookingId: string;
  roomTypeId: string;
  roomId: string | null;
  checkIn: string;
  checkOut: string;
};

export type TypeAvailability = { total: number; booked: number; available: number };

/** How many rooms of each type are free for every night from checkIn up to
 * (not including) checkOut. Rooms taken out of service don't count as stock. */
export function availabilityByType(input: {
  rooms: RoomLite[];
  booked: BookedRoomLite[];
  checkIn: string;
  checkOut: string;
  /** Leave this booking out — when editing one, its own rooms shouldn't block it. */
  excludeBookingId?: string;
}): Record<string, TypeAvailability> {
  const result: Record<string, TypeAvailability> = {};
  for (const room of input.rooms) {
    const entry = (result[room.roomTypeId] ??= { total: 0, booked: 0, available: 0 });
    if (!room.isBlocked) entry.total += 1;
  }
  for (const b of input.booked) {
    if (b.bookingId === input.excludeBookingId) continue;
    if (!stayOverlaps(b.checkIn, b.checkOut, input.checkIn, input.checkOut)) continue;
    const entry = (result[b.roomTypeId] ??= { total: 0, booked: 0, available: 0 });
    entry.booked += 1;
  }
  for (const entry of Object.values(result)) entry.available = Math.max(0, entry.total - entry.booked);
  return result;
}

/** Specific rooms that can take a stay right now: in service, and not already
 * assigned to an overlapping booking. */
export function freeRooms(input: {
  rooms: RoomLite[];
  booked: BookedRoomLite[];
  checkIn: string;
  checkOut: string;
  excludeBookingId?: string;
  roomTypeId?: string;
}): RoomLite[] {
  const taken = new Set<string>();
  for (const b of input.booked) {
    if (b.bookingId === input.excludeBookingId || !b.roomId) continue;
    if (stayOverlaps(b.checkIn, b.checkOut, input.checkIn, input.checkOut)) taken.add(b.roomId);
  }
  return input.rooms.filter(
    (r) => !r.isBlocked && !taken.has(r.id) && (!input.roomTypeId || r.roomTypeId === input.roomTypeId),
  );
}
