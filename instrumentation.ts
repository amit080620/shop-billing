/** Errors while the server renders a screen or runs a save, sent to Sentry (lib/sentry) when it is
 * set up. Crashes on phones reach Sentry through the app's own error log instead. */
export async function onRequestError(err: unknown, request: { path: string }, context: { routePath: string; routeType: string }) {
  if (!process.env.SENTRY_DSN) return;
  const { sendToSentry } = await import("./lib/sentry");
  const error = err as Error & { digest?: string };
  await sendToSentry({
    message: error?.message || String(err),
    stack: error?.stack,
    tags: { context: `server-${context.routeType}`, screen: context.routePath, digest: error?.digest },
    url: request.path,
  });
}
