import NextLink from "next/link";
import type { ComponentProps } from "react";

/** next/link, but a screen is not fetched from the server just because its link is on screen.
 * Next.js's default loads every visible link ahead: opening Home sent 16 requests and opening the
 * menu 11 more, all at once. Each request at the same moment can make the server start another
 * instance, and a new instance can take seconds to start — so a shop's real tap often waited behind
 * screens it never opened. Instead a screen is fetched the moment a finger touches its link
 * (app/components/PrefetchOnTouch), and the bottom bar's screens are kept ready one at a time
 * (lib/useKeepReady). Pass `prefetch` to load a link ahead anyway. */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
