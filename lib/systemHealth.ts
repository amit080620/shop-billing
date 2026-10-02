import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "./supabase/admin";

/** The newest nightly database backup (.github/workflows/db-backup.yml), from its private bucket. */
export async function lastBackup(): Promise<{ name: string; at: string; bytes: number } | null> {
  const { data } = await createSupabaseAdminClient().storage.from("db-backups").list("", { limit: 1, sortBy: { column: "name", order: "desc" } });
  const file = data?.[0];
  if (!file?.created_at) return null;
  return { name: file.name, at: file.created_at, bytes: Number((file.metadata as { size?: number } | null)?.size ?? 0) };
}

/** The test robot's latest run (.github/workflows/e2e.yml), from GitHub's public API. Kept ten
 * minutes: GitHub allows few unauthenticated calls. */
export const lastTestRun = unstable_cache(
  async (): Promise<{ conclusion: string | null; status: string; at: string; url: string } | null> => {
    try {
      const res = await fetch("https://api.github.com/repos/amit080620/shop-billing/actions/workflows/e2e.yml/runs?per_page=1", {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const run = ((await res.json()) as { workflow_runs?: { conclusion: string | null; status: string; created_at: string; html_url: string }[] }).workflow_runs?.[0];
      return run ? { conclusion: run.conclusion, status: run.status, at: run.created_at, url: run.html_url } : null;
    } catch {
      return null;
    }
  },
  ["e2e-last-run"],
  { revalidate: 600 },
);
