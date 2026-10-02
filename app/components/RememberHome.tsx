"use client";

import { useEffect } from "react";

/** Remembers on the phone which screen is this shop's home (Fast Billing, New Bill, the restaurant
 * tables…), so opening the app at "/" goes straight there from the edge (middleware) without first
 * running the server and asking Supabase who is logged in — a whole round trip saved on every app
 * opening. Not sensitive: a path only; the screen itself still checks the login. */
export function RememberHome({ path }: { path: string }) {
  useEffect(() => {
    document.cookie = `ray_home=${encodeURIComponent(path)}; path=/; max-age=31536000; samesite=lax; secure`;
  }, [path]);
  return null;
}
