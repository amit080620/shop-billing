import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { VERTICALS } = await import("../seo/verticals");
const { BUSINESS_TYPES } = await import("../businessType");
const { videoById } = await import("../trainingVideos");
const { loadTranscript, videoObject } = await import("../seo/videoSeo");
const { commonFaqs } = await import("../seo/commonFaqs");

afterEach(() => vi.unstubAllGlobals());

describe("trade pages", () => {
  it("cover every business type once, with their own address", () => {
    expect(new Set(VERTICALS.map((v) => v.type))).toEqual(new Set(BUSINESS_TYPES.map((b) => b.value)));
    expect(new Set(VERTICALS.map((v) => v.slug)).size).toBe(VERTICALS.length);
    for (const v of VERTICALS) expect(v.slug).toMatch(/^[a-z-]+$/);
  });

  it("send every trade the main site has a page for there, keeping only wholesale here", () => {
    expect(VERTICALS.filter((v) => !v.mainSite).map((v) => v.slug)).toEqual(["wholesale-distributor"]);
    for (const v of VERTICALS) if (v.mainSite) expect(v.mainSite).toMatch(/^https://www.theray.in/billing-software/[a-z-]+$/);
  });

  it("only show training videos that exist", () => {
    for (const v of VERTICALS) for (const id of v.videos) expect(videoById(id), `${v.slug} → ${id}`).toBeTruthy();
  });

  it("quote the trade's own prices", () => {
    expect(commonFaqs("restaurant", "restaurant")[0].a).toContain("₹12,000");
    expect(commonFaqs("grocery", "kirana store")[0].a).toContain("₹999");
  });
});

describe("video transcript", () => {
  const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
Namaste, is video mein billing dekhenge.

00:00:22.000 --> 00:00:24.000
Ye demo page hai.

00:00:44.000 --> 00:00:47.500
Grocery demo kholte hain.`;

  it("puts each subtitle under the chapter it falls in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(vtt)));
    const parts = await loadTranscript(videoById("01")!);
    expect(parts.map((p) => p.title)).toEqual(["Introduction", "Demo page", "Open the grocery demo"]);
    expect(parts[1].text).toBe("Ye demo page hai.");
  });

  it("is empty when the subtitles can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadTranscript(videoById("01")!)).toEqual([]);
  });

  it("describes the video with a clip per chapter", () => {
    const v = videoById("02")!;
    const o = videoObject(v, { youtubeId: "7uL9SqaxYWw", uploadDate: "2026-10-02", mp4: "x.mp4", description: "d" });
    expect((o as { embedUrl?: string }).embedUrl).toBe("https://www.youtube.com/embed/7uL9SqaxYWw");
    expect(o.hasPart).toHaveLength(v.topics.length);
    expect(o.hasPart.at(-1)?.endOffset).toBe(v.seconds);
    expect(o.duration).toMatch(/^PT\d+M\d+S$/);
  });
});
