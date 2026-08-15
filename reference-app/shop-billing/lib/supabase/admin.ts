import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client — bypasses RLS entirely. Every query made with this
// client MUST be manually scoped by shop_id (see lib/auth.ts + §3.12).
// Never import this file from a 'use client' component.
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
