import { describe, it, expect, vi, beforeEach } from "vitest";

type Mod = typeof import("../counterCustomers");
let mod: Mod;

const ROWS: [string, string, string, number][] = [
  ["1", "Ajay Khan", "9000010008", 19],
  ["2", "Amit More", "9000010002", 0],
  ["3", "Rakesh Khanna", "9812345678", 5],
  ["4", "Sneha Khan", "9000010003", 0],
  ["5", "Mohd Sakhawat", "9900000001", 0],
];

function serve(shop: string, complete = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ shop, complete, rows: ROWS }))));
}

beforeEach(async () => {
  vi.resetModules();
  mod = await import("../counterCustomers");
});

describe("counter customers", () => {
  it("has nothing to offer before the list is loaded", () => {
    expect(mod.searchCounterCustomers("shop-a", "900", true)).toBeNull();
  });

  it("finds by the start of the number, sorted by name", async () => {
    serve("shop-a");
    await mod.loadCounterCustomers("shop-a");
    expect(mod.searchCounterCustomers("shop-a", "90000", true)?.map((c) => c.name)).toEqual(["Ajay Khan", "Amit More", "Sneha Khan"]);
    expect(mod.searchCounterCustomers("shop-a", "9000010008", true)?.[0]).toEqual({ id: "1", name: "Ajay Khan", phone: "9000010008", loyaltyPoints: 19 });
  });

  it("finds by name: starting with it first, then a word starting with it, then anywhere", async () => {
    serve("shop-a");
    await mod.loadCounterCustomers("shop-a");
    expect(mod.searchCounterCustomers("shop-a", "kha", false)?.map((c) => c.name)).toEqual(["Ajay Khan", "Rakesh Khanna", "Sneha Khan", "Mohd Sakhawat"]);
  });

  it("never answers for another shop", async () => {
    serve("shop-a");
    await mod.loadCounterCustomers("shop-a");
    expect(mod.searchCounterCustomers("shop-b", "900", true)).toBeNull();
  });

  it("leaves it to the server when the list is not complete", async () => {
    serve("shop-a", false);
    await mod.loadCounterCustomers("shop-a");
    expect(mod.searchCounterCustomers("shop-a", "900", true)).toBeNull();
  });

  it("loads again after a customer is added", async () => {
    serve("shop-a");
    await mod.loadCounterCustomers("shop-a");
    mod.forgetCounterCustomers();
    expect(mod.searchCounterCustomers("shop-a", "900", true)).toBeNull();
    await mod.loadCounterCustomers("shop-a");
    expect(mod.searchCounterCustomers("shop-a", "900", true)?.length).toBe(3);
  });
});
