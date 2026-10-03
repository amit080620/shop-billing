import NextLink from "next/link";
import type { ComponentProps } from "react";

/** next/link, but a screen is not fetched from the server just because its link is on screen.
 * Next.js's default loads every visible link ahead: opening Home sent 16 requests and opening the
 * menu 11 more, all at once. Each request at the same moment can make the server start another
 * instance, and on a weak connection a burst holds up the one request that matters. Instead links
 * on screen are loaded one at a time when the phone is idle, and a touched link jumps the queue
 * (app/components/PrefetchOnTouch); the bottom bar's screens are kept ready by lib/useKeepReady.
 * Pass `prefetch` to have Next.js load a link ahead itself. */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
