import "server-only";

/** Error reports to Sentry, sent from the server — no Sentry code in the app phones download. The
 * app already reports every crash to the server (lib/actions/errorReporting) and logs server
 * errors (lib/audit logError, instrumentation.ts); with SENTRY_DSN set, each also goes to Sentry,
 * whose screen shows the exact line of code: the app's source maps are published
 * (productionBrowserSourceMaps), and the repository is public anyway. Without SENTRY_DSN this does
 * nothing. Never throws, and gives up after a few seconds. */

type Frame = { filename: string; abs_path: string; function: string; lineno: number; colno: number; in_app: boolean };

/** Stack frames from a V8 stack trace, oldest first (as Sentry wants them). */
export function framesFrom(stack: string): Frame[] {
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const m = line.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    frames.push({ function: m[1] ?? "?", filename: m[2], abs_path: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|\/_next\/static\/chunks\/(framework|main|webpack|polyfills)/.test(m[2]) });
  }
  return frames.reverse();
}

export async function sendToSentry(report: {
  message: string;
  stack?: string | null;
  level?: "error" | "warning";
  tags?: Record<string, string | undefined>;
  extra?: Record<string, unknown>;
  url?: string | null;
}): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/\//g, "");
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const firstLine = report.stack?.split("\n")[0] ?? "";
    const type = firstLine.match(/^(\w*Error)\b/)?.[1] ?? "Error";
    const frames = report.stack ? framesFrom(report.stack) : [];
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: report.level ?? "error",
      release: process.env.NEXT_PUBLIC_BUILD_ID,
      environment: process.env.VERCEL_ENV ?? "production",
      tags: Object.fromEntries(Object.entries(report.tags ?? {}).filter(([, v]) => v)),
      extra: report.extra,
      ...(report.url ? { request: { url: report.url } } : {}),
      exception: { values: [{ type, value: report.message.slice(0, 1000), ...(frames.length ? { stacktrace: { frames } } : {}) }] },
    };
    const envelope = [JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
    await fetch(`${u.protocol}//${u.host}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=the-ray/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reporting must never add to the problem.
  }
}
