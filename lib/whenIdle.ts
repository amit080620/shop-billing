/** Runs fn once the phone has a quiet moment after the screen has come up (at most `timeout` ms
 * later), so work that isn't needed for the first view stays out of the way of opening the app.
 * Returns a function that cancels it. */
export function whenIdle(fn: () => void, timeout = 4000): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, Math.min(timeout, 2000));
  return () => clearTimeout(id);
}
