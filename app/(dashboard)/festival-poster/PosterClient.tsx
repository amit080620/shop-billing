"use client";

import { useRef, useState } from "react";
import { Sparkles, Download, Share2, Loader2 } from "lucide-react";
import { generatePosterTextAction, type PosterText } from "@/lib/actions/poster";

const THEMES = [
  { name: "Diwali gold", bg: ["#7c1d1d", "#c9962c"], accent: "#fff4d6" },
  { name: "Holi colors", bg: ["#0891b2", "#db2777"], accent: "#fff9c4" },
  { name: "Independence", bg: ["#1e3a8a", "#166534"], accent: "#fff7ed" },
  { name: "Simple sale", bg: ["#1f2937", "#374151"], accent: "#fde68a" },
];

export function PosterClient({ shopName }: { shopName: string }) {
  const [occasion, setOccasion] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [themeIndex, setThemeIndex] = useState(0);
  const [text, setText] = useState<PosterText | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const theme = THEMES[themeIndex];

  async function generate() {
    setIsGenerating(true);
    setError(null);
    const result = await generatePosterTextAction(occasion, discountPercent ? Number(discountPercent) : null);
    setIsGenerating(false);
    if (result.error === "not_configured") {
      setError("Poster generator needs the free Groq AI key set up (Settings).");
      return;
    }
    if (result.error || !result.text) {
      setError(result.error ?? "Couldn't generate that — try again.");
      return;
    }
    setText(result.text);
  }

  async function toPngBlob(): Promise<Blob | null> {
    const svgEl = svgRef.current;
    if (!svgEl) return null;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function download() {
    const blob = await toPngBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shopName.replace(/\s+/g, "-")}-poster.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const blob = await toPngBlob();
    if (!blob) return;
    const file = new File([blob], "poster.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Offer poster" });
      } catch {
        // user cancelled — fine
      }
    } else {
      download();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="neu-card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Occasion / Offer (jaise Diwali sale)</span>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="e.g. Diwali sale, Weekend offer, Clear old stock"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Discount % (agar hai)</span>
          <input
            type="number"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="e.g. 20"
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Design chunein</span>
          <div className="flex gap-2">
            {THEMES.map((t, i) => (
              <button
                key={t.name}
                onClick={() => setThemeIndex(i)}
                className={`h-9 flex-1 rounded-lg border-2 ${i === themeIndex ? "border-brand" : "border-transparent"}`}
                style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }}
                aria-label={t.name}
              />
            ))}
          </div>
        </div>
        <button onClick={generate} disabled={isGenerating} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {isGenerating ? "Likh rahe hain…" : text ? "Dobara likhein" : "Poster banayein"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {text && (
        <>
          <div className="overflow-hidden rounded-2xl">
            <svg ref={svgRef} viewBox="0 0 1080 1080" width="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={theme.bg[0]} />
                  <stop offset="100%" stopColor={theme.bg[1]} />
                </linearGradient>
              </defs>
              <rect width="1080" height="1080" fill="url(#bg)" />
              <circle cx="90" cy="90" r="140" fill="white" opacity="0.06" />
              <circle cx="990" cy="990" r="180" fill="white" opacity="0.06" />
              <circle cx="950" cy="130" r="60" fill={theme.accent} opacity="0.15" />

              <text x="540" y="140" textAnchor="middle" fontSize="40" fontWeight="700" fill={theme.accent} fontFamily="sans-serif">
                {shopName}
              </text>
              <text x="540" y="480" textAnchor="middle" fontSize="76" fontWeight="800" fill="white" fontFamily="sans-serif">
                {text.headline.length > 24 ? text.headline.slice(0, 24) : text.headline}
              </text>
              <text x="540" y="600" textAnchor="middle" fontSize="52" fontWeight="700" fill={theme.accent} fontFamily="sans-serif">
                {text.offerLine}
              </text>
              <rect x="340" y="700" width="400" height="90" rx="45" fill="white" opacity="0.15" />
              <text x="540" y="757" textAnchor="middle" fontSize="34" fontWeight="600" fill="white" fontFamily="sans-serif">
                {text.ctaLine}
              </text>
              <text x="540" y="980" textAnchor="middle" fontSize="26" fill="white" opacity="0.7" fontFamily="sans-serif">
                Visit us today!
              </text>
            </svg>
          </div>
          <div className="flex gap-2">
            <button onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand px-3 py-2.5 text-sm font-medium text-brand">
              <Download size={16} /> Download karein
            </button>
            <button onClick={share} className="btn-primary flex flex-1 items-center justify-center gap-2">
              <Share2 size={16} /> Share karein
            </button>
          </div>
        </>
      )}
    </div>
  );
}
