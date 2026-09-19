"use client";

import { useEffect, useState } from "react";

/** window.location.origin after mount ("" during server render). Reading it
 * during render made the server HTML (no link) differ from the browser's
 * (full link) — a React hydration error on every share-link settings page. */
export function useOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
