import { describe, expect, it } from "vitest";
import { videoForScreen } from "../screenVideos";
import { TRAINING_VIDEOS, videosFor } from "../trainingVideos";

describe("videoForScreen", () => {
  it("picks the trade's own video for a shared screen", () => {
    expect(videoForScreen("/bills/new", "pharmacy")).toEqual({ id: "05", t: 43 });
    expect(videoForScreen("/bills/new", "lab")).toEqual({ id: "01", t: 120 });
  });
  it("uses the longest matching path", () => {
    expect(videoForScreen("/products/rates", "wholesale")).toEqual({ id: "32", t: 26 });
    expect(videoForScreen("/transport/lr/abc-123", "transport")).toEqual({ id: "26", t: 20 });
    expect(videoForScreen("/bills/abc", "grocery")).toEqual({ id: "01", t: 211 });
  });
  it("has nothing for a screen without a video", () => {
    expect(videoForScreen("/nowhere", "grocery")).toBeNull();
    expect(videoForScreen("/billsx", "grocery")).toBeNull();
  });
  it("points only at videos that exist, inside their length", () => {
    for (const path of ["/dashboard", "/bills/new", "/reports/dues", "/jewellery/karigar", "/daily-summary"]) {
      for (const type of ["grocery", "pharmacy", "wholesale", "lab"]) {
        const v = videoForScreen(path, type)!;
        const video = TRAINING_VIDEOS.find((x) => x.id === v.id)!;
        expect(video).toBeTruthy();
        expect(v.t).toBeLessThan(video.seconds);
      }
    }
  });
});

describe("videosFor", () => {
  it("puts the trade's own videos first", () => {
    const { own, common } = videosFor("wholesale");
    expect(own.map((v) => v.id)).toEqual(["30", "32"]);
    expect(common.some((v) => v.id === "01")).toBe(true);
  });
});
