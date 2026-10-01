"use client";

import { useEffect, useRef, useState } from "react";
import { PlayCircle, Share2 } from "lucide-react";
import { youtubeEmbed } from "@/lib/youtube";
import { VIDEO_ASPECT } from "@/lib/trainingVideos";

type Words = {
  topics: string;
  share: string;
  subtitlesNote: string;
  youtubeNote?: string;
  play?: string;
};

/** A training video on the phone. Plays from YouTube when the chapter has a YouTube id (sharper,
 * and no load on our storage), else the phone-size copy from storage with subtitles on. Starts from
 * the asked second, and the list of the video's parts jumps inside it. `lite` shows only the poster
 * until tapped, so a page that merely offers a video stays light. Words come from the page (public
 * pages have no language provider). */
export function VideoPlayer({
  src,
  poster,
  vtt,
  youtubeId,
  start = 0,
  topics,
  shareText,
  shareUrl,
  words,
  lite = false,
  showTopics = true,
}: {
  src: string;
  poster: string;
  vtt: string;
  youtubeId?: string | null;
  start?: number;
  topics: [number, string][];
  shareText: string;
  shareUrl: string;
  words: Words;
  lite?: boolean;
  showTopics?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [on, setOn] = useState(!lite);
  const [from, setFrom] = useState(start);
  const [now, setNow] = useState(start);

  // Storage copy: seek once its length is known.
  useEffect(() => {
    const v = video.current;
    if (youtubeId || !v || !from) return;
    const go = () => {
      v.currentTime = from;
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  }, [from, on, youtubeId]);

  // YouTube: ask the embedded player to report its time, to light up the part being played.
  useEffect(() => {
    if (!youtubeId || !on) return;
    const onMessage = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const t = data?.info?.currentTime;
        if (typeof t === "number") setNow(t);
      } catch {}
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [youtubeId, on]);

  const command = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  const listen = () => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");

  function jump(t: number) {
    setNow(t);
    if (!on) {
      setFrom(t);
      setOn(true);
    } else if (youtubeId) {
      command("seekTo", [t, true]);
      command("playVideo");
    } else if (video.current) {
      video.current.currentTime = t;
      void video.current.play().catch(() => undefined);
    }
    (frame.current ?? video.current)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const current = topics.filter(([t]) => t <= now + 0.5).pop()?.[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto w-full" style={{ maxWidth: `calc(75vh * ${VIDEO_ASPECT})` }}>
        <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: VIDEO_ASPECT }}>
          {!on ? (
            <button type="button" onClick={() => setOn(true)} className="group absolute inset-0 h-full w-full" aria-label={words.play ?? "Play"}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a small poster shipped with the app */}
              <img src={poster} alt="" className="h-full w-full object-cover object-top opacity-90" />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25">
                <PlayCircle size={64} strokeWidth={1.5} className="text-white drop-shadow-lg transition-transform group-hover:scale-105" />
                {words.play && <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">{words.play}</span>}
              </span>
            </button>
          ) : youtubeId ? (
            <iframe
              ref={frame}
              key={`${youtubeId}-${from}`}
              src={youtubeEmbed(youtubeId, from, lite)}
              title={shareText}
              onLoad={listen}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <video
              ref={video}
              controls
              playsInline
              autoPlay={lite}
              preload="metadata"
              poster={poster}
              onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
              className="absolute inset-0 h-full w-full object-contain"
            >
              <source src={src} type="video/mp4" />
              <track kind="subtitles" src={vtt} srcLang="hi" label="Hinglish" default />
            </video>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted">{youtubeId ? (words.youtubeNote ?? "") : words.subtitlesNote}</p>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 self-center rounded-full border border-success px-3 py-1.5 text-xs font-semibold text-success"
      >
        <Share2 size={13} /> {words.share}
      </a>
      {showTopics && topics.length > 0 && (
        <section className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{words.topics}</p>
          <ul className="flex flex-col gap-1">
            {topics.map(([t, title]) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => jump(t)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${current === t ? "bg-brand-soft font-semibold text-brand-text" : "text-foreground hover:bg-surface-2"}`}
                >
                  <span className="w-10 shrink-0 font-mono text-xs text-muted">{mmss(t)}</span>
                  <span className="min-w-0">{title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
