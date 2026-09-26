import { isDemoEmail } from "./config";

/** The demo shops are shared by everyone who opens /demo, so a few things that
 * would affect other visitors or cost real money are switched off there. */
export function isDemoSession(session: { email: string | null }): boolean {
  return isDemoEmail(session.email);
}

export const DEMO_LOCKED_MESSAGE = "This is a demo shop, so this is switched off here. Everything else works — go ahead and try it.";

/** Returns the error text to show when a demo session tries something switched off, else null. */
export function demoLocked(session: { email: string | null }): string | null {
  return isDemoSession(session) ? DEMO_LOCKED_MESSAGE : null;
}
