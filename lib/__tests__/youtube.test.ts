import { describe, expect, it } from "vitest";
import { chapterFromTitle, playlistId, videosFromPlaylistHtml, youtubeEmbed, youtubeId } from "../youtube";

describe("youtubeId", () => {
  it("reads every kind of link", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId(" dQw4w9WgXcQ ")).toBe("dQw4w9WgXcQ");
  });
  it("rejects other text", () => {
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("hello")).toBeNull();
  });
});

describe("playlistId", () => {
  it("finds the list id", () => {
    expect(playlistId("https://www.youtube.com/playlist?list=PLabcdefghijKLMN")).toBe("PLabcdefghijKLMN");
    expect(playlistId("https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijKLMN&index=2")).toBe("PLabcdefghijKLMN");
    expect(playlistId("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
  });
});

describe("chapterFromTitle", () => {
  it("uses the leading number", () => {
    expect(chapterFromTitle("01 - The Ray - Common Billing & Dashboard")).toBe("01");
    expect(chapterFromTitle("7. Restaurant")).toBe("07");
    expect(chapterFromTitle("Chapter 32 Wholesale")).toBe("32");
  });
  it("falls back to the title", () => {
    expect(chapterFromTitle("Grocery / Kirana – Complete Workflow")).toBe("02");
  });
  it("gives up on unrelated titles", () => {
    expect(chapterFromTitle("My holiday video")).toBeNull();
    expect(chapterFromTitle("99 problems")).toBeNull();
  });
});

describe("videosFromPlaylistHtml", () => {
  it("pulls ids and titles in order, once each", () => {
    const html =
      'x"playlistVideoRenderer":{"videoId":"AAAAAAAAAAA","thumbnail":{},"title":{"runs":[{"text":"01 - The Ray \\u0026 You"}]}}' +
      '"playlistVideoRenderer":{"videoId":"BBBBBBBBBBB","index":{},"title":{"runs":[{"text":"02 - Grocery"}]}}' +
      '"playlistVideoRenderer":{"videoId":"AAAAAAAAAAA","title":{"runs":[{"text":"dup"}]}}';
    expect(videosFromPlaylistHtml(html)).toEqual([
      { id: "AAAAAAAAAAA", title: "01 - The Ray & You" },
      { id: "BBBBBBBBBBB", title: "02 - Grocery" },
    ]);
  });
});

describe("youtubeEmbed", () => {
  it("starts at the second asked and keeps subtitles on", () => {
    const u = youtubeEmbed("dQw4w9WgXcQ", 91.6, true);
    expect(u).toContain("/embed/dQw4w9WgXcQ?");
    expect(u).toContain("start=91");
    expect(u).toContain("autoplay=1");
    expect(u).toContain("cc_load_policy=1");
  });
});
