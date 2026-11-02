import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { GARMENT_TEXT } from "../i18n/garmentText";
import { MENU_TEXT } from "../i18n/menuText";
import { PAGE_TEXT } from "../i18n/pageText";
import { HOTEL_TEXT } from "../i18n/hotelText";
import { SCREEN_STRINGS } from "../i18n/screens";
import hi from "../i18n/hi";
import { translate } from "../i18n/dictionary";
import {
  BUCKET_LABEL,
  DAMAGE_DISPOSITION_LABEL,
  DAMAGE_REASON_LABEL,
  DISCREPANCY_KIND_LABEL,
  GODOWN_KIND_LABEL,
  MOVEMENT_LABEL,
  RESOLUTION_LABEL,
  RETURN_DISPOSITION_LABEL,
  STATUS_LABEL,
  movementGst,
} from "../garment/rules";

const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
// Words that read the same in Hindi and Marathi.
const SAME = new Set(["GST", "MRP", "GST %", "CSV"]);
const ROOT = path.resolve(__dirname, "../..");

function files(dir: string, keep: (p: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) files(p, keep, out);
    } else if (/\.tsx?$/.test(e.name) && keep(p)) out.push(p);
  }
  return out;
}
const tKeys = (src: string) => [...src.matchAll(/(?<![\w$])t\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));

describe("garment text", () => {
  it("has Hindi and Marathi for every entry, with the same {placeholders}", () => {
    for (const [english, [h, m]] of Object.entries(GARMENT_TEXT)) {
      expect(h.trim(), `${english} hi`).not.toBe("");
      expect(m.trim(), `${english} mr`).not.toBe("");
      expect(tokens(h), `${english} hi tokens`).toEqual(tokens(english));
      expect(tokens(m), `${english} mr tokens`).toEqual(tokens(english));
    }
  });

  it("never changes a word another table already translates", () => {
    const earlier = { ...MENU_TEXT, ...PAGE_TEXT, ...HOTEL_TEXT };
    for (const english of Object.keys(GARMENT_TEXT)) {
      if (english in hi) expect(translate("hi", english), english).toBe((hi as Record<string, string>)[english]);
      else if (english in SCREEN_STRINGS) expect(translate("hi", english), english).toBe(SCREEN_STRINGS[english][1]);
      else if (english in earlier) expect(translate("hi", english), english).toBe(earlier[english][0]);
      else expect(translate("hi", english), english).toBe(GARMENT_TEXT[english][0]);
    }
  });

  it("covers every label and GST note the garment screens show", () => {
    const gst = [
      movementGst({ fromGstin: "27AAAAA0000A1Z5", toGstin: "27AAAAA0000A1Z5", value: 60000 }),
      movementGst({ fromGstin: "27AAAAA0000A1Z5", toGstin: "29AAAAA0000A1Z5", value: 10 }),
      movementGst({ fromGstin: "27AAAAA0000A1Z5", toGstin: null, value: 10 }),
      movementGst({ fromGstin: "27AAAAA0000A1Z5", toGstin: "27AAAAA0000A1Z5", fromState: "27", toState: "29", value: 10 }),
    ].flatMap((g) => g.notes);
    const labels = [STATUS_LABEL, RESOLUTION_LABEL, BUCKET_LABEL, MOVEMENT_LABEL, RETURN_DISPOSITION_LABEL, GODOWN_KIND_LABEL, DAMAGE_REASON_LABEL, DAMAGE_DISPOSITION_LABEL, DISCREPANCY_KIND_LABEL].flatMap((m) => Object.values(m));
    for (const s of [...gst, ...labels]) {
      expect(translate("hi", s), `hi: ${s}`).not.toBe(s);
      expect(translate("mr", s), `mr: ${s}`).not.toBe(s);
    }
  });

  it("covers every t(\"…\") on the garment screens", () => {
    const screens = [
      ...files(path.join(ROOT, "app", "(dashboard)", "garment"), () => true),
      ...files(path.join(ROOT, "app", "print", "garment"), () => true),
    ];
    expect(screens.length).toBeGreaterThan(20);
    const missing = new Set<string>();
    for (const f of screens) for (const k of tKeys(fs.readFileSync(f, "utf8"))) if (!SAME.has(k) && !k.includes(".") && translate("hi", k) === k) missing.add(k);
    expect([...missing]).toEqual([]);
  });

  it("adds no translation to a word an existing screen shows", () => {
    // A garment-only word used by a non-garment screen would start showing in Hindi there.
    const before = new Set([...Object.keys(hi), ...Object.keys(SCREEN_STRINGS), ...Object.keys(MENU_TEXT), ...Object.keys(PAGE_TEXT), ...Object.keys(HOTEL_TEXT)]);
    const fresh = new Set(Object.keys(GARMENT_TEXT).filter((k) => !before.has(k) && !SAME.has(k)));
    const isGarment = (p: string) => /[\\/]garment[\\/]/.test(p) || p.endsWith(`${path.sep}MoreMenu.tsx`);
    const used: string[] = [];
    for (const f of files(path.join(ROOT, "app"), (p) => !isGarment(p))) for (const k of tKeys(fs.readFileSync(f, "utf8"))) if (fresh.has(k)) used.push(`${k} ← ${path.relative(ROOT, f)}`);
    expect(used).toEqual([]);
  });
});
