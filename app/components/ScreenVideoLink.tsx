"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { useBusinessType } from "@/lib/BusinessTypeContext";
import { videoForScreen } from "@/lib/screenVideos";
import { useT } from "@/lib/i18n/LangContext";

/** "▶ Video" beside a page title: the training video for this screen, from the right second. */
export function ScreenVideoLink() {
  const type = useBusinessType();
  const pathname = usePathname();
  const { t } = useT();
  if (!type || pathname.startsWith("/help/videos")) return null;
  const v = videoForScreen(pathname, type);
  if (!v) return null;
  return (
    <Link href={`/help/videos/${v.id}?t=${v.t}`} className="flex shrink-0 items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-text" aria-label={t("Watch how this screen works")}>
      <PlayCircle size={13} /> {t("Video")}
    </Link>
  );
}
