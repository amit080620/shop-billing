"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { PlayCircle, X } from "lucide-react";
import { useBusinessType } from "@/lib/BusinessTypeContext";
import { videoForScreen } from "@/lib/screenVideos";
import { useT } from "@/lib/i18n/LangContext";
import { screenVideoAction } from "@/lib/actions/screenVideo";
import { Popup } from "./Popup";

// Loaded only when a video is opened, so the top bar stays light on every screen.
const VideoPlayer = dynamic(() => import("./VideoPlayer").then((m) => m.VideoPlayer), { ssr: false });

type Video = NonNullable<Awaited<ReturnType<typeof screenVideoAction>>>;

/** "▶ Video" in the top bar: the training video for this screen, from the right second, in a popup
 * over the screen — a bill half made (its cart lives only on this screen) is still there after
 * watching. The phone's Back closes the popup rather than leaving the screen. Lives in the bar (not
 * the page title) so screens with their own header — New Bill, Home, Settings — get it too.
 * `classicNote`: in the New look (lib/uiVersion), says the video was made in the Classic look. */
export function ScreenVideoLink({ classicNote }: { classicNote?: boolean }) {
  const type = useBusinessType();
  const pathname = usePathname();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [failed, setFailed] = useState(false);
  const [, startLoading] = useTransition();
  const pushed = useRef(false);

  // Back (or any navigation) closes it.
  useEffect(() => {
    if (!open) return;
    function onPop() {
      pushed.current = false;
      setOpen(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
  useEffect(() => {
    pushed.current = false;
    setOpen(false);
  }, [pathname]);

  const v = type && !pathname.startsWith("/help/videos") ? videoForScreen(pathname, type) : null;
  if (!v) return null;
  const screen = v;

  function show() {
    window.history.pushState({ ...(window.history.state ?? {}), rayVideo: true }, "");
    pushed.current = true;
    setOpen(true);
    if (video?.id === screen.id) return;
    setVideo(null);
    setFailed(false);
    startLoading(async () => {
      const got = await screenVideoAction(screen.id).catch(() => null);
      if (got) setVideo(got);
      else setFailed(true);
    });
  }

  function close() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back(); // its popstate closes the popup
    } else {
      setOpen(false);
    }
  }

  return (
    <>
      <button type="button" onClick={show} className="flex h-9 w-9 shrink-0 items-center justify-center gap-1 self-center rounded-full border border-brand/40 bg-brand-soft text-xs font-semibold text-brand-text sm:h-8 sm:w-auto sm:px-2.5" aria-label={t("Watch how this screen works")} title={t("Watch how this screen works")}>
        <PlayCircle size={17} />
        <span className="hidden sm:inline">{t("Video")}</span>
      </button>
      {open &&
        createPortal(
          <Popup open onClose={close} maxWidthClassName="max-w-2xl">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-foreground">{video?.title ?? t("Watch how this screen works")}</p>
              <button type="button" onClick={close} aria-label={t("Close")} className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
                <X size={18} />
              </button>
            </div>
            {classicNote && <p className="mb-2 text-xs text-muted">{t("This video shows the Classic look.")}</p>}
            {video ? (
              <VideoPlayer
                src={video.mp4}
                poster={video.poster}
                vtt={video.vtt}
                youtubeId={video.youtubeId}
                start={Math.max(0, Math.min(video.seconds - 5, screen.t))}
                topics={video.topics}
                showTopics={false}
                maxVh={60}
                shareText={`The Ray — ${video.title}`}
                shareUrl={`https://bill.theray.in/videos/${video.id}`}
                words={{ topics: t("Jump to a part"), share: t("Share this video on WhatsApp"), subtitlesNote: t("Subtitles are on — turn them off from the player's CC button."), youtubeNote: t("Clearer picture: tap ⚙ in the player and pick a higher quality.") }}
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted">{failed ? t("Couldn't load the video — check the connection and try again.") : t("Loading…")}</p>
            )}
          </Popup>,
          document.body,
        )}
    </>
  );
}
