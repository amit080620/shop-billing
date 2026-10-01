"use client";

import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";

type Words = { topics: string; share: string; subtitlesNote: string };

/** A training video on the phone: subtitles on, starts from the asked second, and a list of the
 * video's parts to jump to. Words come from the page (public pages have no language provider). */
export function VideoPlayer({ src, poster, vtt, start = 0, topics, shareText, shareUrl, words }: { src: string; poster: string; vtt: string; start?: number; topics: [number, string][]; shareText: string; shareUrl: string; words: Words }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(start);

  useEffect(() => {
    const v = ref.current;
    if (!v || !start) return;
    const go = () => {
      v.currentTime = start;
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  }, [start]);

  function jump(t: number) {
    const v = ref.current;
    if (!v) return;
    v.currentTime = t;
    void v.play().catch(() => undefined);
    v.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const current = topics.filter(([t]) => t <= now + 0.5).pop()?.[0];

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        poster={poster}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        className="mx-auto max-h-[75vh] w-full rounded-xl bg-black object-contain"
        crossOrigin="anonymous"
      >
        <source src={src} type="video/mp4" />
        <track kind="subtitles" src={vtt} srcLang="hi" label="Hinglish" default />
      </video>
      <p className="text-center text-[11px] text-muted">{words.subtitlesNote}</p>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 self-center rounded-full border border-success px-3 py-1.5 text-xs font-semibold text-success">
        <Share2 size={13} /> {words.share}
      </a>
      {topics.length > 0 && (
        <section className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{words.topics}</p>
          <ul className="flex flex-col gap-1">
            {topics.map(([t, title]) => (
              <li key={t}>
                <button type="button" onClick={() => jump(t)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${current === t ? "bg-brand-soft font-semibold text-brand-text" : "text-foreground hover:bg-surface-2"}`}>
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
