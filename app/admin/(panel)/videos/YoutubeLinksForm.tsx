"use client";

import { useState, useTransition } from "react";
import { readYoutubeLinksAction, saveYoutubeLinksAction } from "@/lib/actions/admin-videos";

type Chapter = { id: string; title: string; length: string; link: string };
type Found = { ytId: string; title: string; chapter: string | null };

export function YoutubeLinksForm({ chapters }: { chapters: Chapter[] }) {
  const [links, setLinks] = useState<Record<string, string>>(Object.fromEntries(chapters.map((c) => [c.id, c.link])));
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<Found[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = chapters.some((c) => (links[c.id] ?? "") !== c.link);

  function read() {
    start(async () => {
      setNote(null);
      const res = await readYoutubeLinksAction(paste);
      if (!res.ok) return setNote({ ok: false, text: res.error });
      const next = { ...links };
      let matched = 0;
      for (const f of res.found) {
        if (!f.chapter) continue;
        next[f.chapter] = `https://youtu.be/${f.ytId}`;
        matched++;
      }
      setLinks(next);
      setUnmatched(res.found.filter((f) => !f.chapter));
      setNote({
        ok: true,
        text: `Found ${res.found.length} video(s), matched ${matched} to chapters.${res.playlistError ? ` ${res.playlistError}` : ""} Check the list, then Save.`,
      });
    });
  }

  function save() {
    start(async () => {
      const res = await saveYoutubeLinksAction(links);
      setNote(
        res.ok
          ? {
              ok: true,
              text: `Saved. ${res.count} chapter(s) now play from YouTube (live within a minute).`,
            }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3">
        <label className="text-xs font-medium text-gray-300" htmlFor="yt-paste">
          Playlist link, or video links (any order)
        </label>
        <textarea
          id="yt-paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
          placeholder="https://www.youtube.com/playlist?list=…"
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
        />
        <button type="button" onClick={read} disabled={pending || !paste.trim()} className="self-start rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-50">
          {pending ? "Reading…" : "Read links"}
        </button>
      </div>

      {note && <p className={`rounded-lg px-3 py-2 text-xs ${note.ok ? "bg-emerald-900/30 text-emerald-200" : "bg-red-900/30 text-red-200"}`}>{note.text}</p>}

      {unmatched.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-3 text-xs text-amber-200">
          <p className="font-semibold">Not matched to a chapter (title should start with its number, like &quot;07 - …&quot;):</p>
          <ul className="mt-1 list-disc pl-4">
            {unmatched.map((u) => (
              <li key={u.ytId}>
                {u.title || "(no title)"} — https://youtu.be/{u.ytId}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {chapters.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 rounded-lg border border-gray-800 px-3 py-2">
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-gray-200">
                <span className="font-mono text-gray-400">{c.id}</span> {c.title}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-px text-[10px] font-semibold ${links[c.id] ? "bg-red-600/80 text-white" : "bg-gray-800 text-gray-400"}`}>
                {links[c.id] ? "YouTube" : "Storage"}
              </span>
            </p>
            <input
              value={links[c.id] ?? ""}
              onChange={(e) => setLinks({ ...links, [c.id]: e.target.value })}
              placeholder="YouTube link (blank = storage copy)"
              aria-label={`YouTube link for chapter ${c.id}`}
              className="rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-gray-100"
            />
          </li>
        ))}
      </ul>

      <button type="button" onClick={save} disabled={pending || !changed} className="sticky bottom-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-lg disabled:opacity-50">
        {pending ? "Saving…" : changed ? "Save" : "Saved"}
      </button>
    </div>
  );
}
