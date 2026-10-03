import "server-only";

/** This server instance: a short random id, and whether it has served anything yet. A screen that
 * reaches a server instance which has only just started (a "cold start") waits for the whole app's
 * server code to load first; Speed watch counts those (lib/auth requireSession), and the id, shown
 * in each page's head, tells which screens share a server function, so each can be kept warm
 * (app/api/version). */
export const INSTANCE_ID = Math.random().toString(36).slice(2, 8);
const BOOTED_AT = Date.now();
let served = 0;

/** Call once per request: true for the first request this instance serves. */
export function firstRequestHere(): { cold: boolean; upMs: number } {
  served++;
  return { cold: served === 1, upMs: Date.now() - BOOTED_AT };
}
