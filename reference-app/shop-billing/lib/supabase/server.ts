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

/**
 * Wraps supabase.auth.getUser() so an invalid/expired refresh token never
 * surfaces as an unhandled AuthApiError — this happens naturally whenever
 * a browser holds onto old session cookies past their refresh window
 * (e.g. after a long time away, or the project's JWT secret rotated).
 * Treats any auth failure as "not logged in" rather than throwing, and
 * proactively signs out to clear the stale cookies so the next request
 * starts clean instead of hitting the same broken refresh repeatedly.
 */
export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      if (error.code === "refresh_token_not_found" || error.status === 400) {
        await supabase.auth.signOut();
      }
      return null;
    }
    return user;
  } catch {
    // A thrown AuthApiError (some SDK paths throw rather than return an
    // error field) or a transient network failure calling Supabase Auth
    // itself — either way, the caller should treat this as "no session"
    // and redirect to login, not crash the page.
    try {
      await supabase.auth.signOut();
    } catch {
      // Already broken; nothing more to clean up.
    }
    return null;
  }
}
