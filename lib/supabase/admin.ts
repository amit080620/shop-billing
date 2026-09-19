import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { pagingFetch } from "./pagingFetch";

const fetchAllRows = pagingFetch();

// Service-role client — bypasses RLS entirely. Every query made with this
// client MUST be manually scoped by shop_id (see lib/auth.ts + §3.12).
// Never import this file from a 'use client' component.
// Reads return every matching row, not just Supabase's first 1,000 (see
// pagingFetch.ts).
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchAllRows },
    },
  );
}
