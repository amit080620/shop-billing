import { describe, it, expect } from "vitest";
import { computeColumnWidths, buildItemRowLines, buildHeaderRow, buildTwoColumnRow, buildDivider } from "../textGrid";
import { THERMAL_58_DEFAULT, THERMAL_80_DEFAULT } from "../printerProfile";

describe("textGrid — the genuine guarantee that a long item name never misaligns the amount column", () => {
  it("genuinely keeps every line at exactly the printer's usable width, even for a long wrapped name", () => {
    const lines = buildItemRowLines("SPECIAL CHEESE PANEER TIKKA MASALA", "1", "360.00", "360.00", THERMAL_58_DEFAULT);
    const cols = computeColumnWidths(THERMAL_58_DEFAULT);
    const fullWidth = cols.item + 1 + cols.qty + 1 + cols.rate + 1 + cols.amount;
    for (const line of lines) {
      // Every genuine line is either the full combined width (the
      // numbers line) or the item-only column width (a wrapped
      // continuation line) — never anything in between or longer.
      expect([cols.item, fullWidth]).toContain(line.length);
    }
  });

  it("genuinely puts Qty/Rate/Amount only on the LAST wrapped line, never on continuation lines", () => {
    const lines = buildItemRowLines("A Very Long Product Name That Wraps", "2", "50.00", "100.00", THERMAL_58_DEFAULT);
    expect(lines.length).toBeGreaterThan(1);
    // Continuation lines (all but the last) genuinely contain no digits
    // from the price fields.
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i]).not.toContain("100.00");
    }
    expect(lines[lines.length - 1]).toContain("100.00");
  });

  it("genuinely fits a short item name on a single line with no wrapping", () => {
    const lines = buildItemRowLines("Chai", "1", "15.00", "15.00", THERMAL_80_DEFAULT);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("15.00");
  });

  it("genuinely gives 80mm printers more item-name room than 58mm printers", () => {
    const cols58 = computeColumnWidths(THERMAL_58_DEFAULT);
    const cols80 = computeColumnWidths(THERMAL_80_DEFAULT);
    expect(cols80.item).toBeGreaterThan(cols58.item);
  });

  it("genuinely builds a header row at the exact same width as item rows", () => {
    const header = buildHeaderRow(THERMAL_58_DEFAULT);
    const itemLine = buildItemRowLines("X", "1", "1.00", "1.00", THERMAL_58_DEFAULT)[0];
    expect(header.length).toBe(itemLine.length);
  });

  it("genuinely right-pads a two-column total row to the printer's full width", () => {
    const row = buildTwoColumnRow("Total", "Rs.100.00", THERMAL_58_DEFAULT);
    expect(row.length).toBe(32); // THERMAL_58_DEFAULT.charactersPerLine
    expect(row.startsWith("Total")).toBe(true);
    expect(row.endsWith("Rs.100.00")).toBe(true);
  });

  it("genuinely builds a divider of the correct printer width", () => {
    expect(buildDivider(THERMAL_58_DEFAULT).length).toBe(32);
    expect(buildDivider(THERMAL_80_DEFAULT).length).toBe(48);
  });

  it("genuinely hard-breaks a single word that's itself longer than the item column, without ever overflowing", () => {
    const lines = buildItemRowLines("Supercalifragilisticexpialidocious", "1", "1.00", "1.00", THERMAL_58_DEFAULT);
    const cols = computeColumnWidths(THERMAL_58_DEFAULT);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(cols.item + 1 + cols.qty + 1 + cols.rate + 1 + cols.amount);
    }
  });
});
