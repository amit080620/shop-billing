import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card WhatsApp/Twitter/Google actually show when someone shares a
 * link to the app — without this file, a shared link showed no preview
 * at all, just bare blue text. That's a real cost exactly at the
 * moment a trusted contact is introducing someone to the product.
 * Generated at request time from plain JSX (Satori, not real CSS —
 * this is next/og's own supported subset), not a static asset, so
 * updating the pitch later doesn't mean re-exporting an image file. */
export default async function OpengraphImage() {
  const logoData = await readFile(join(process.cwd(), "public/brand-logo.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

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
          backgroundColor: "#08061a",
          backgroundImage: "radial-gradient(ellipse 120% 90% at 50% -10%, #2a2468 0%, #150f33 45%, #08061a 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={160} height={169} />
        <div style={{ display: "flex", color: "#ffffff", fontSize: 64, fontWeight: 700, marginTop: 28, letterSpacing: -1 }}>
          Your whole shop, in one app
        </div>
        <div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 30, marginTop: 18 }}>
          Billing · GST · Udhar · Stock — for every kind of shop
        </div>
      </div>
    ),
    { ...size },
  );
}
