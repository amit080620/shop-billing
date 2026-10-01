import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

let installActionGuard: () => void;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "build-old");
  ({ installActionGuard } = await import("../actionGuard"));
});

afterEach(() => vi.unstubAllGlobals());

/** A page running "build-old", whose next fetch gets a reply with these headers. */
function page(replyHeaders: Record<string, string>) {
  const assign = vi.fn();
  const reload = vi.fn();
  const reply = new Response("body", { headers: replyHeaders });
  const win = { fetch: vi.fn(async () => reply), location: { href: "https://bill.theray.in/bills/new", assign, reload } };
  vi.stubGlobal("window", win);
  installActionGuard();
  return { win, assign, reload, reply };
}

const action = { method: "POST", headers: { "Next-Action": "abc123", Accept: "text/x-component" } };
const settled = (p: Promise<unknown>) => Promise.race([p.then(() => "settled"), new Promise((r) => setTimeout(() => r("pending"), 20))]);

describe("installActionGuard", () => {
  it("leaves ordinary requests alone", async () => {
    const { win, reply, assign, reload } = page({ "x-ray-build": "build-new", "x-action-redirect": "/print/bill/1;push" });
    expect(await win.fetch("/api/version")).toBe(reply);
    expect(assign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("passes through replies from the same deploy", async () => {
    const { win, reply } = page({ "x-ray-build": "build-old", "x-action-redirect": "/print/bill/1;push", "x-action-revalidated": "[[],1,0]" });
    expect(await win.fetch("/bills/new", action)).toBe(reply);
  });

  it("passes through a newer deploy's reply that carries no screen", async () => {
    const { win, reply, reload } = page({ "x-ray-build": "build-new", "x-action-revalidated": "[[],0,0]" });
    expect(await win.fetch("/bills/new", action)).toBe(reply);
    expect(reload).not.toHaveBeenCalled();
  });

  it("opens the redirect target fresh when a newer deploy answers a save", async () => {
    const { win, assign } = page({ "x-ray-build": "build-new", "x-action-redirect": "/print/bill/42?new=1;push", "x-action-revalidated": "[[],1,0]" });
    expect(await settled(win.fetch("/bills/new", action))).toBe("pending");
    expect(assign).toHaveBeenCalledWith("https://bill.theray.in/print/bill/42?new=1");
  });

  it("reloads the page when a newer deploy's save refreshed it", async () => {
    const { win, reload } = page({ "x-ray-build": "build-new", "x-action-revalidated": "[[],1,0]" });
    expect(await settled(win.fetch("/customers/9", { method: "POST", headers: new Headers({ "next-action": "x" }) }))).toBe("pending");
    expect(reload).toHaveBeenCalled();
  });
});
