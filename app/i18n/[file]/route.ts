import { dictionaryAsset } from "@/lib/i18n/dictionaryAsset";
import type { Lang } from "@/lib/i18n/dictionary";

/** `/i18n/hi.<hash>.js` — the shop language's text (lib/i18n/dictionaryAsset). The current words
 * under their own hash are cached for a year; any other hash (a page from before a deploy) gets the
 * current words, never cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^(en|hi|mr)\.([0-9a-f]{10})\.js$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  const asset = dictionaryAsset(m[1] as Lang);
  return new Response(asset.body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": m[2] === asset.hash ? "public, max-age=31536000, s-maxage=31536000, immutable" : "no-store",
    },
  });
}
