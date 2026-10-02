import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { framesFrom, sendToSentry } = await import("../sentry");

const STACK = `TypeError: Cannot read properties of undefined (reading 'call')
    at r (https://bill.theray.in/_next/static/chunks/webpack-fefe08a3f3e8ba9c.js:1:128)
    at s (https://bill.theray.in/_next/static/chunks/1255-623a1bc706ecd6cc.js:1:151601)
    at https://bill.theray.in/_next/static/chunks/app/page-5ce0d3ee395887fa.js:1:8368`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("framesFrom", () => {
  it("reads a V8 stack, oldest frame first", () => {
    const frames = framesFrom(STACK);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ function: "?", lineno: 1, colno: 8368, in_app: true });
    expect(frames[2]).toMatchObject({ function: "r", abs_path: "https://bill.theray.in/_next/static/chunks/webpack-fefe08a3f3e8ba9c.js", colno: 128, in_app: false });
  });
});

describe("sendToSentry", () => {
  it("does nothing without SENTRY_DSN", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await sendToSentry({ message: "x" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts an envelope to the DSN's project with the error type, frames and tags", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o42.ingest.sentry.io/777");
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    expect(await sendToSentry({ message: "Cannot read properties of undefined (reading 'call')", stack: STACK, level: "warning", tags: { context: "client-crash", shop: undefined } })).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o42.ingest.sentry.io/api/777/envelope/");
    expect((init.headers as Record<string, string>)["X-Sentry-Auth"]).toContain("sentry_key=abc123");
    const [, item, event] = String(init.body).split("\n").map((l) => JSON.parse(l));
    expect(item.type).toBe("event");
    expect(event.level).toBe("warning");
    expect(event.tags).toEqual({ context: "client-crash" });
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "Cannot read properties of undefined (reading 'call')" });
    expect(event.exception.values[0].stacktrace.frames).toHaveLength(3);
  });

  it("never throws when Sentry is unreachable", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o42.ingest.sentry.io/777");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(sendToSentry({ message: "x" })).resolves.toBe(false);
  });
});
