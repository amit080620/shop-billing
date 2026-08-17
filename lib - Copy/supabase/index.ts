// ONLY browser-safe exports live here. Never import next/headers or the
// service-role key into this file — Client Components import from here,
// and webpack will try to bundle server-only code into the browser bundle.
export { createSupabaseBrowserClient } from "./browser";
export type { Database } from "./database.types";
