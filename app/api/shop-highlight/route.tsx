import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireSession } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeShopHighlight } from "@/lib/shopHighlight";

export const runtime = "nodejs";

// next/og renders through Satori's own bundled font, not the browser
// (there's no system-font fallback the way a real page has), and that
// font doesn't include the ₹ glyph — it silently drew as a tofu box.
// "Rs." reads perfectly fine and sidesteps needing to fetch a whole
// custom font file just for one symbol.
function rupees(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
}

/** A genuinely different kind of feature for a billing app: a daily,
 * auto-generated, story-shaped (1080×1920, the WhatsApp Status /
 * Instagram Story ratio) card an owner can post themselves — turning
 * every proud shop owner sharing their own numbers into a small,
 * organic ad for the app itself ("Powered by The Ray" in the corner),
 * without anyone having to ask them to. Requires a real login (this
 * shows real sales figures) — never a public route the way the
 * customer-facing pages are. Same next/og technique as
 * opengraph-image.tsx, just a different aspect ratio and real,
 * per-shop data computed at request time. */
export async function GET() {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const [{ data: shop }, highlight] = await Promise.all([
    admin.from("shops").select("name, logo_url").eq("id", session.shopId).single(),
    computeShopHighlight(admin, session.shopId),
  ]);

  const logoData = await readFile(join(process.cwd(), "public/brand-logo.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 70px",
          backgroundColor: "#08061a",
          backgroundImage: "radial-gradient(ellipse 140% 70% at 50% -10%, #2a2468 0%, #150f33 45%, #08061a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: "rgba(255,255,255,0.55)", fontSize: 30 }}>
          {shop?.name ?? "Your shop"}
        </div>
        <div style={{ display: "flex", color: "rgba(255,255,255,0.4)", fontSize: 26, marginTop: 8 }}>{today}</div>

        {highlight.isRecord && (
          <div
            style={{
              display: "flex",
              marginTop: 44,
              padding: "14px 32px",
              borderRadius: 999,
              backgroundColor: "rgba(245, 158, 11, 0.18)",
              color: "#fbbf24",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            🎉 Best day in 30 days!
          </div>
        )}

        <div style={{ display: "flex", color: "rgba(255,255,255,0.5)", fontSize: 34, marginTop: highlight.isRecord ? 56 : 90 }}>Today&apos;s sales</div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: 130, fontWeight: 800, letterSpacing: -3, marginTop: 4 }}>
          {rupees(highlight.totalSales)}
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: 56 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "28px 40px",
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.06)",
              minWidth: 260,
            }}
          >
            <div style={{ display: "flex", color: "rgba(255,255,255,0.5)", fontSize: 26 }}>Bills today</div>
            <div style={{ display: "flex", color: "#ffffff", fontSize: 52, fontWeight: 700, marginTop: 6 }}>{highlight.billCount}</div>
          </div>
          {highlight.topItem && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "28px 40px",
                borderRadius: 28,
                backgroundColor: "rgba(255,255,255,0.06)",
                minWidth: 260,
              }}
            >
              <div style={{ display: "flex", color: "rgba(255,255,255,0.5)", fontSize: 26 }}>Bestseller</div>
              <div style={{ display: "flex", color: "#ffffff", fontSize: 32, fontWeight: 700, marginTop: 10, textAlign: "center" }}>{highlight.topItem}</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 70 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" width={44} height={46} />
          <div style={{ display: "flex", color: "rgba(255,255,255,0.4)", fontSize: 24 }}>Powered by The Ray</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 },
  );
}
