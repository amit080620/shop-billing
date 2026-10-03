import Link from "@/lib/link";
import { PlayCircle } from "lucide-react";
import { mmss, videoFiles, type TrainingVideo } from "@/lib/trainingVideos";

/** Training videos as cards with a picture and the length; `href` is where each one opens. */
export function VideoList({ videos, href }: { videos: TrainingVideo[]; href: (id: string) => string }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
      {videos.map((v) => (
        <li key={v.id}>
          <Link href={href(v.id)} className="neu-card flex h-full flex-col overflow-hidden">
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a poster from storage */}
              <img src={videoFiles(v.id).poster} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/10">
                <PlayCircle size={34} className="text-white drop-shadow" />
              </span>
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{mmss(v.seconds)}</span>
            </div>
            <p className="line-clamp-3 px-2.5 py-2 text-xs font-medium text-foreground">{v.title}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
