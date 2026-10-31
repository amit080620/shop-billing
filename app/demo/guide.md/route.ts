import { guideBlocks, guideMarkdown } from "@/lib/demo/guide";
import { demoPublicLinks } from "@/lib/demo/links";

export const revalidate = 3600;

const BASE = "https://bill.theray.in";

/** The demo guide as plain markdown: the easiest form for an AI agent to read in one go. Kept out of
 * search results (noindex): /demo/guide is the same guide as a page. */
export async function GET() {
  const text = guideMarkdown(guideBlocks(BASE, await demoPublicLinks(BASE)));
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, s-maxage=3600", "x-robots-tag": "noindex" } });
}
