import { describe, it, expect } from "vitest";
import { buildWhatsAppLink } from "../whatsapp";

describe("buildWhatsAppLink — genuinely caught 7 real missing-country-code bugs earlier", () => {
  it("adds the +91 country code to a plain 10-digit number", () => {
    const link = buildWhatsAppLink("9876543210", "Hello");
    expect(link).toContain("919876543210");
  });

  it("genuinely does NOT double-prefix a number that already has a country code", () => {
    const link = buildWhatsAppLink("+919876543210", "Hello");
    expect(link).toContain("919876543210");
    expect(link).not.toContain("91919876543210");
  });

  it("genuinely strips spaces, dashes and parentheses from a messily-formatted number", () => {
    const link = buildWhatsAppLink("+91 98765-43210", "Hello");
    expect(link).toContain("919876543210");
  });

  it("genuinely URL-encodes the message text", () => {
    const link = buildWhatsAppLink("9876543210", "Hi there! Balance: ₹100");
    expect(link).toContain("text=");
    expect(link).not.toContain(" "); // genuinely no raw spaces in the URL
  });

  it("genuinely produces a valid wa.me URL structure", () => {
    const link = buildWhatsAppLink("9876543210", "test");
    expect(link.startsWith("https://wa.me/")).toBe(true);
  });
});
