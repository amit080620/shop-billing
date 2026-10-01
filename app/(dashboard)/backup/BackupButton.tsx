"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

/** Makes the backup and saves it: a small file comes straight back, a big one as a short-lived link. */
export function BackupButton() {
  const { t } = useT();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/export/backup", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      if ((res.headers.get("content-type") ?? "").includes("application/json")) {
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
      } else {
        const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "backup.xlsx";
        const href = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
      }
      setState("done");
      router.refresh(); // "Last backup" moves to now
    } catch (e) {
      // The server's messages are plain English phrases, which are also their translation keys.
      setError(t((e as Error).message || "Could not make the backup. Please try again."));
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={download} disabled={state === "working"} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
        {state === "done" ? <CheckCircle2 size={17} /> : <FileUp size={17} />}
        {state === "working" ? t("Preparing your file… (can take up to a minute)") : state === "done" ? t("Downloaded — check your Downloads folder") : t("Download backup (Excel)")}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
