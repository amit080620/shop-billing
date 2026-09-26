/** Small helpers the demo seeders share: dates relative to today (India time),
 * repeatable "random" numbers, and made-up phone numbers. */

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** Today's date in India, as YYYY-MM-DD. */
export function todayIst(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD, `days` from today (negative = past). */
export function dateOffset(days: number): string {
  return new Date(Date.now() + IST_OFFSET_MS + days * 86400_000).toISOString().slice(0, 10);
}

/** A timestamp `daysAgo` days back at hh:mm India time — for backdating rows the
 * app stamped "now" while the seeder created them. */
export function isoAt(daysAgo: number, hour: number, minute = 0): string {
  const day = dateOffset(-daysAgo);
  const local = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);
  return local.toISOString();
}

/** A tiny seeded generator so a demo looks the same each night instead of
 * jumping around. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
    shuffle: <T>(list: readonly T[]): T[] => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/** Made-up mobile numbers in a range no real person is assigned to, so a
 * WhatsApp link from the demo goes nowhere. */
export function fakePhone(n: number): string {
  return `90000${String(10000 + n).slice(-5)}`;
}

export const INDIAN_FIRST_NAMES = ["Amit", "Priya", "Rahul", "Sneha", "Vijay", "Anita", "Suresh", "Kavita", "Manoj", "Deepa", "Rohit", "Neha", "Sanjay", "Pooja", "Ajay", "Meera", "Karan", "Divya", "Nilesh", "Asha"];
export const INDIAN_LAST_NAMES = ["Sharma", "Patil", "Deshmukh", "Kulkarni", "Joshi", "Gupta", "Verma", "Nair", "Iyer", "Khan", "Singh", "Mehta", "Jadhav", "Pawar", "More", "Shinde", "Bhosale", "Reddy", "Yadav", "Chavan"];

export function personName(random: ReturnType<typeof rng>): string {
  return `${random.pick(INDIAN_FIRST_NAMES)} ${random.pick(INDIAN_LAST_NAMES)}`;
}

/** A FormData from a plain object (undefined values are skipped) — for calling
 * the app's form actions the way the browser would. */
export function formData(fields: Record<string, string | number | boolean | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    fd.set(k, String(v));
  }
  return fd;
}
