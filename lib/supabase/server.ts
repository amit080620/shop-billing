import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// Uses the logged-in user's session (anon key + cookies). Respects auth,
// used for anything that should run "as the current user" — but note the
// rest of this app scopes data manually via lib/auth.ts, not via RLS.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, which can't set cookies — safe to
            // ignore here. Server Actions (which CAN set cookies) still refresh
            // the session normally whenever one runs, e.g. creating a bill.
          }
        },
      },
    },
  );
}
