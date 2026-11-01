// The New look's gate (lib/uiVersion): only a shop on the allowlist can have it, and only when this
// device chose it — the "ray-ui" cookie alone never opens it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const jar = new Map<string, string>();
const cookieStore = {
  get: vi.fn((name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined)),
  set: vi.fn((name: string, value: string) => void jar.set(name, value)),
};
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/auth", () => ({ requireSession: vi.fn() }));

const { newUiAllowed, resolveUi, getUiVersion, UI_COOKIE } = await import("@/lib/uiVersion");
const { setUiVersionAction } = await import("@/lib/actions/uiVersion");
const { requireSession } = await import("@/lib/auth");
const { cookies } = await import("next/headers");

const realShop = { shopId: "shop-1", email: "owner@example.com" };
const otherShop = { shopId: "shop-2", email: "someone@example.com" };
const demoShop = { shopId: "demo-9", email: "grocery@demo.theray.in" };

beforeEach(() => {
  jar.clear();
  vi.clearAllMocks();
  vi.stubEnv("NEW_UI_SHOPS", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("newUiAllowed", () => {
  it("lets no shop in while the list is empty (the default)", () => {
    for (const shop of [realShop, otherShop, demoShop]) expect(newUiAllowed(shop, "")).toBe(false);
  });

  it("lets in exactly the shop ids on the list", () => {
    expect(newUiAllowed(realShop, " shop-1 , shop-7")).toBe(true);
    expect(newUiAllowed(otherShop, " shop-1 , shop-7")).toBe(false);
    expect(newUiAllowed(realShop, "shop-10")).toBe(false);
  });

  it("'demo' lets in the demo shops and no real shop", () => {
    expect(newUiAllowed(demoShop, "demo")).toBe(true);
    expect(newUiAllowed(realShop, "demo")).toBe(false);
    expect(newUiAllowed({ shopId: "x", email: null }, "demo")).toBe(false);
  });

  it("reads NEW_UI_SHOPS when no list is passed", () => {
    expect(newUiAllowed(realShop)).toBe(false);
    vi.stubEnv("NEW_UI_SHOPS", "shop-1");
    expect(newUiAllowed(realShop)).toBe(true);
  });
});

describe("resolveUi", () => {
  it("a cookie alone never gives the New look", () => {
    expect(resolveUi(false, "new")).toBe("classic");
  });

  it("an allowed shop gets New only when this device chose 'new'", () => {
    expect(resolveUi(true, "new")).toBe("new");
    for (const v of [undefined, "", "classic", "NEW", "1", "true"]) expect(resolveUi(true, v)).toBe("classic");
  });
});

describe("getUiVersion", () => {
  it("a shop off the list is Classic and its cookie isn't even read", async () => {
    jar.set(UI_COOKIE, "new");
    expect(await getUiVersion(realShop)).toBe("classic");
    expect(cookies).not.toHaveBeenCalled();
  });

  it("a listed shop follows its cookie", async () => {
    vi.stubEnv("NEW_UI_SHOPS", "shop-1");
    expect(await getUiVersion(realShop)).toBe("classic");
    jar.set(UI_COOKIE, "new");
    expect(await getUiVersion(realShop)).toBe("new");
    expect(await getUiVersion(otherShop)).toBe("classic");
  });
});

describe("setUiVersionAction", () => {
  it("refuses New for a shop off the list and leaves the cookie alone", async () => {
    vi.mocked(requireSession).mockResolvedValue(realShop as never);
    expect(await setUiVersionAction("new")).toEqual({ error: "The new look isn't open for this shop yet." });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("saves New for a listed shop, as a cookie the page's scripts can't read", async () => {
    vi.stubEnv("NEW_UI_SHOPS", "shop-1");
    vi.mocked(requireSession).mockResolvedValue(realShop as never);
    expect(await setUiVersionAction("new")).toEqual({});
    expect(cookieStore.set).toHaveBeenCalledWith(UI_COOKIE, "new", expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 31536000 }));
  });

  it("always lets a shop go back to Classic", async () => {
    vi.mocked(requireSession).mockResolvedValue(realShop as never);
    expect(await setUiVersionAction("classic")).toEqual({});
    expect(jar.get(UI_COOKIE)).toBe("classic");
  });

  it("refuses anything that isn't one of the two looks", async () => {
    vi.mocked(requireSession).mockResolvedValue(realShop as never);
    expect(await setUiVersionAction("admin" as never)).toEqual({ error: "Couldn't switch the look — try again." });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
