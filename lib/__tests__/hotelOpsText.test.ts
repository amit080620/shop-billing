import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { HOTEL_OPS_TEXT } from "../i18n/hotelOpsText";
import { MENU_TEXT } from "../i18n/menuText";
import { PAGE_TEXT } from "../i18n/pageText";
import { HOTEL_TEXT } from "../i18n/hotelText";
import { GARMENT_TEXT } from "../i18n/garmentText";
import { PURCHASE_TEXT } from "../i18n/purchaseText";
import { NEW_HOME_TEXT } from "../i18n/newHomeText";
import { NEW_POS_TEXT } from "../i18n/newPosText";
import { SCREEN_STRINGS } from "../i18n/screens";
import hi from "../i18n/hi";
import { translate, translations } from "../i18n/dictionary";
import { HK_LABEL, TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL } from "../hotel/housekeeping";
import { SESSION_LABEL } from "../hotel/events";

const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const ROOT = path.resolve(__dirname, "../..");
const T_KEY = new RegExp('(?<![\\w$])t\\("((?:[^"\\\\]|\\\\.)*)"', "g");

function files(dir: string, keep: (p: string) => boolean, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) files(p, keep, out);
    } else if (/\.tsx?$/.test(e.name) && keep(p)) out.push(p);
  }
  return out;
}
const tKeys = (src: string) => [...src.matchAll(T_KEY)].map((m) => m[1].replace(/\\(.)/g, "$1"));
const earlier = () => ({ ...MENU_TEXT, ...PAGE_TEXT, ...HOTEL_TEXT, ...GARMENT_TEXT, ...PURCHASE_TEXT, ...NEW_HOME_TEXT, ...NEW_POS_TEXT });

describe("hotel operations text", () => {
  it("has Hindi and Marathi for every entry, with the same {placeholders}", () => {
    for (const [english, [h, m]] of Object.entries(HOTEL_OPS_TEXT)) {
      expect(h.trim(), `${english} hi`).not.toBe("");
      expect(m.trim(), `${english} mr`).not.toBe("");
      expect(tokens(h), `${english} hi tokens`).toEqual(tokens(english));
      expect(tokens(m), `${english} mr tokens`).toEqual(tokens(english));
    }
  });

  it("never changes a word another table already translates", () => {
    const before = earlier();
    for (const english of Object.keys(HOTEL_OPS_TEXT)) {
      if (english in hi) expect(translate("hi", english), english).toBe((hi as Record<string, string>)[english]);
      else if (english in SCREEN_STRINGS) expect(translate("hi", english), english).toBe(SCREEN_STRINGS[english][1]);
      else if (english in before) expect(translate("hi", english), english).toBe(before[english][0]);
      else expect(translate("hi", english), english).toBe(HOTEL_OPS_TEXT[english][0]);
    }
  });

  it("covers every t(\"…\") and label on the hotel screens", () => {
    const screens = [...files(path.join(ROOT, "app", "(dashboard)", "hotel"), () => true), ...files(path.join(ROOT, "app", "print", "hotel-form-c"), () => true)];
    expect(screens.length).toBeGreaterThan(20);
    const missing = new Set<string>();
    for (const f of screens) for (const k of tKeys(fs.readFileSync(f, "utf8"))) if (!k.includes(".") && !(k in translations.hi)) missing.add(k);
    for (const k of [...Object.values(HK_LABEL), ...Object.values(TICKET_CATEGORY_LABEL), ...Object.values(TICKET_PRIORITY_LABEL), ...Object.values(SESSION_LABEL)]) if (!(k in translations.hi)) missing.add(k);
    expect([...missing]).toEqual([]);
  });

  it("adds no translation to a word another trade's screen shows", () => {
    // A word only this table has, used elsewhere, would start showing in Hindi there.
    const before = new Set([...Object.keys(hi), ...Object.keys(SCREEN_STRINGS), ...Object.keys(earlier())]);
    const fresh = new Set(Object.keys(HOTEL_OPS_TEXT).filter((k) => !before.has(k)));
    const isHotel = (p: string) => /[\\/]hotel[\\/]/.test(p) || /[\\/]hotel-form-c[\\/]/.test(p) || p.endsWith(`${path.sep}MoreMenu.tsx`);
    const used: string[] = [];
    for (const f of files(path.join(ROOT, "app"), (p) => !isHotel(p))) for (const k of tKeys(fs.readFileSync(f, "utf8"))) if (fresh.has(k)) used.push(`${k} ← ${path.relative(ROOT, f)}`);
    expect(used).toEqual([]);
  });
});
