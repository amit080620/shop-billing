"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { useBusinessType } from "@/lib/BusinessTypeContext";
import { videoForScreen } from "@/lib/screenVideos";
import { useT } from "@/lib/i18n/LangContext";

/** "▶ Video" in the top bar: the training video for this screen, from the right second. Lives in the
 * bar (not the page title) so screens with their own header — New Bill, Home, Settings — get it too. */
export function ScreenVideoLink() {
  const type = useBusinessType();
  const pathname = usePathname();
  const { t } = useT();
  if (!type || pathname.startsWith("/help/videos")) return null;
  const v = videoForScreen(pathname, type);
  if (!v) return null;
  return (
    <Link href={`/help/videos/${v.id}?t=${v.t}`} className="flex h-8 shrink-0 items-center gap-1 self-center rounded-full border border-brand/40 bg-brand-soft px-2.5 text-xs font-semibold text-brand-text" aria-label={t("Watch how this screen works")}>
      <PlayCircle size={15} /> {t("Video")}
    </Link>
  );
}
