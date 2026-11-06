"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { MapProps } from "./MapView";

// The map library loads only where a map is shown (React.lazy keeps it out of every other screen), and
// only in the browser: it needs the page's window, so the server sends the outline and the phone draws.
const MapView = lazy(() => import("./MapView"));

export function MapLazy(props: MapProps) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);
  const outline = <div style={{ height: props.height ?? 380 }} className="w-full animate-pulse rounded-xl bg-surface-2" />;
  if (!inBrowser) return outline;
  return (
    <Suspense fallback={outline}>
      <MapView {...props} />
    </Suspense>
  );
}
