"use client";

import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/lib/i18n/LanguageToggle";
import type { Lang } from "@/lib/i18n/dictionary";

/** A genuinely deep, layered 3D scene for the login screen only — every
 * other auth screen (signup, forgot/reset password) keeps the plain
 * AuthShell on purpose, so this stays a first-impression moment rather
 * than something that gets in the way of a form someone fills in daily.
 *
 * Everything here is plain CSS 3D transforms (perspective + rotateX/Y +
 * translateZ) driven by pointer position — no 3D library, nothing new in
 * package.json. The logo is a single flat PNG, but stacking many copies
 * of it at tiny incremental depths (see LogoStack below) is what actually
 * reads as an extruded, lit object once the whole stack tilts — the same
 * trick behind most "3D from a flat image" login/hero scenes.
 *
 * Pointer-driven tilt only runs on devices that report a real mouse
 * (hover: hover, pointer: fine) — touch screens get the idle float/drift
 * animation instead, never a phantom gyroscope permission prompt.
 * Everything respects prefers-reduced-motion by freezing in place. */
export function Login3DScene({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const frame = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    setReady(true);
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover || reducedMotion.current) return;

    function onMove(e: PointerEvent) {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        // -1..1 across the viewport, so the scene tilts toward wherever
        // the pointer actually is rather than always centering on it.
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = (e.clientY / window.innerHeight) * 2 - 1;
        setTilt({ x, y });
        frame.current = null;
      });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div
      className="login-scene relative min-h-screen w-full overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 140% 90% at 50% -10%, #241f52 0%, #150f33 42%, #08061a 100%)",
        // Exposed as CSS custom properties so every layer below reads the
        // same pointer state — near layers use a small multiplier, far
        // layers a bigger one, which is what actually sells parallax
        // depth (things further away appear to move more).
        ["--tx" as string]: tilt.x,
        ["--ty" as string]: tilt.y,
      }}
    >
      {/* Starfield — a pure CSS dot pattern, not JS-generated positions,
          so there's zero hydration risk from randomness. */}
      <div className="login-stars" aria-hidden="true" />

      {/* Floating glass/gradient orbs at three different depths. */}
      <div className="login-orb login-orb-a" aria-hidden="true" />
      <div className="login-orb login-orb-b" aria-hidden="true" />
      <div className="login-orb login-orb-c" aria-hidden="true" />

      {/* Perspective floor — a receding grid, the classic "deep space"
          cue: parallel lines converging toward a horizon read as real
          depth even though the whole thing is one flat plane. */}
      <div className="login-floor-wrap" aria-hidden="true">
        <div className="login-floor" />
      </div>

      {/* A fixed corner, not part of the centered column below — a
          language switch reads as a deliberate top-right control here,
          not an odd lone element floating in the middle of the page. */}
      <div
        className="login-corner"
        style={
          {
            "--surface": "rgba(255,255,255,0.08)",
            "--border": "rgba(255,255,255,0.14)",
            "--brand-soft": "rgba(255,255,255,0.16)",
            "--brand-text": "#ffffff",
            "--muted": "rgba(255,255,255,0.65)",
            "--foreground": "#ffffff",
          } as React.CSSProperties
        }
      >
        <LanguageToggle lang={lang} />
      </div>

      {/* The actual 3D stage: logo + form card, both inside one
          perspective so they genuinely share the same depth space. */}
      <div className={`login-stage ${ready ? "login-stage-ready" : ""}`}>
        <LogoStack tiltX={tilt.x} tiltY={tilt.y} />
        <div
          className="login-card-wrap"
          style={{
            transform: `perspective(1400px) rotateX(${5 - tilt.y * 3}deg) rotateY(${tilt.x * 4}deg) translateZ(0)`,
          }}
        >
          {children}
        </div>
      </div>

      <style jsx>{`
        .login-stars {
          position: absolute;
          inset: 0;
          opacity: 0.55;
          background-image:
            radial-gradient(1.5px 1.5px at 20% 30%, rgba(255, 255, 255, 0.9), transparent),
            radial-gradient(1px 1px at 65% 12%, rgba(255, 255, 255, 0.7), transparent),
            radial-gradient(1.5px 1.5px at 85% 60%, rgba(255, 255, 255, 0.6), transparent),
            radial-gradient(1px 1px at 40% 75%, rgba(255, 255, 255, 0.5), transparent),
            radial-gradient(1.5px 1.5px at 10% 85%, rgba(255, 255, 255, 0.7), transparent),
            radial-gradient(1px 1px at 92% 35%, rgba(255, 255, 255, 0.6), transparent),
            radial-gradient(1px 1px at 55% 50%, rgba(255, 255, 255, 0.45), transparent),
            radial-gradient(1.5px 1.5px at 30% 55%, rgba(255, 255, 255, 0.5), transparent);
          background-repeat: repeat;
          background-size: 340px 340px;
          animation: login-twinkle 6s ease-in-out infinite;
        }
        @keyframes login-twinkle {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.75; }
        }

        .login-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .login-orb-a {
          top: -8%;
          right: -6%;
          width: min(48vw, 480px);
          height: min(48vw, 480px);
          background: radial-gradient(circle, #c026d3 0%, transparent 70%);
          opacity: 0.5;
          transform: translate3d(calc(var(--tx, 0) * -18px), calc(var(--ty, 0) * -18px), 0);
          animation: login-drift-a 16s ease-in-out infinite;
        }
        .login-orb-b {
          bottom: -12%;
          left: -8%;
          width: min(40vw, 420px);
          height: min(40vw, 420px);
          background: radial-gradient(circle, #4f46e5 0%, transparent 70%);
          opacity: 0.55;
          transform: translate3d(calc(var(--tx, 0) * -12px), calc(var(--ty, 0) * -12px), 0);
          animation: login-drift-b 20s ease-in-out infinite;
        }
        .login-orb-c {
          top: 35%;
          left: 8%;
          width: min(22vw, 220px);
          height: min(22vw, 220px);
          background: radial-gradient(circle, #f59e0b 0%, transparent 72%);
          opacity: 0.28;
          transform: translate3d(calc(var(--tx, 0) * -26px), calc(var(--ty, 0) * -26px), 0);
          animation: login-drift-c 13s ease-in-out infinite;
        }
        @keyframes login-drift-a {
          0%, 100% { margin-top: 0; margin-right: 0; }
          50% { margin-top: 30px; margin-right: -20px; }
        }
        @keyframes login-drift-b {
          0%, 100% { margin-bottom: 0; margin-left: 0; }
          50% { margin-bottom: -25px; margin-left: 20px; }
        }
        @keyframes login-drift-c {
          0%, 100% { transform: translate3d(calc(var(--tx, 0) * -26px), calc(var(--ty, 0) * -26px), 0) scale(1); }
          50% { transform: translate3d(calc(var(--tx, 0) * -26px), calc(var(--ty, 0) * -26px), 0) scale(1.15); }
        }

        .login-floor-wrap {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 46vh;
          overflow: hidden;
          perspective: 380px;
          perspective-origin: 50% 0%;
          opacity: 0.5;
          -webkit-mask-image: linear-gradient(to top, black, transparent);
          mask-image: linear-gradient(to top, black, transparent);
        }
        .login-floor {
          position: absolute;
          inset: -20% -60% 0 -60%;
          transform: rotateX(78deg);
          transform-origin: 50% 0%;
          background-image:
            repeating-linear-gradient(0deg, rgba(129, 140, 248, 0.5) 0 1px, transparent 1px 64px),
            repeating-linear-gradient(90deg, rgba(129, 140, 248, 0.5) 0 1px, transparent 1px 64px);
          background-size: 64px 64px;
          animation: login-floor-scroll 7s linear infinite;
        }
        @keyframes login-floor-scroll {
          from { background-position: 0 0, 0 0; }
          to { background-position: 0 64px, 0 0; }
        }

        .login-corner {
          position: absolute;
          top: max(16px, env(safe-area-inset-top));
          right: max(16px, env(safe-area-inset-right));
          z-index: 2;
        }

        .login-stage {
          position: relative;
          z-index: 1;
          display: flex;
          min-height: 100vh;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 28px 20px 40px;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .login-stage-ready {
          opacity: 1;
          transform: translateY(0);
        }
        .login-card-wrap {
          width: 100%;
          max-width: 380px;
          transition: transform 0.15s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .login-stars,
          .login-orb-a,
          .login-orb-b,
          .login-orb-c,
          .login-floor {
            animation: none !important;
          }
          .login-stage {
            transition: none;
          }
          .login-card-wrap {
            transition: none;
          }
        }
      `}</style>

      {/* Soft-embossed "neumorphic" panel for the login form specifically
          — the card and its fields read as pressed out of / into the
          same dark material rather than a flat glass sheet, matching the
          softer, tactile UI language the rest of the product's own
          light-mode .neu-card already uses, just adapted to this
          screen's dark backdrop. Global (not scoped to this component)
          because it needs to reach AuthForm's own <input>/<button>
          markup rendered as page.tsx's children, and !important to
          out-rank the app-wide input styling rule — which is itself
          !important by design, so nothing here can leak out and affect
          any other screen's inputs. */}
      <style jsx global>{`
        .login-neu-card {
          background: #1a1d24;
          border-radius: 28px;
          padding: 28px 24px;
          box-shadow:
            -10px -10px 24px rgba(255, 255, 255, 0.025),
            12px 12px 28px rgba(0, 0, 0, 0.55);
        }
        .login-neu-card label {
          color: rgba(255, 255, 255, 0.8);
        }
        .login-neu-card input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not(.bg-transparent) {
          background: #1a1d24 !important;
          border-radius: 9999px !important;
          padding: 0.8rem 1.25rem !important;
          box-shadow:
            inset 3px 3px 7px rgba(0, 0, 0, 0.5),
            inset -3px -3px 7px rgba(255, 255, 255, 0.03) !important;
          transition: box-shadow 0.15s ease;
        }
        .login-neu-card input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not(.bg-transparent):focus {
          box-shadow:
            inset 2px 2px 5px rgba(0, 0, 0, 0.55),
            inset -2px -2px 5px rgba(255, 255, 255, 0.03),
            0 0 0 3px color-mix(in srgb, var(--brand) 35%, transparent) !important;
        }
        /* The password field's show/hide eye sits inside this same pill
           (its wrapper is the only relatively-positioned field here), so
           it keeps its extra right-side clearance even though the rule
           above just reset padding on every side evenly. */
        .login-neu-card .relative input:not(.bg-transparent) {
          padding-right: 2.75rem !important;
        }
        .login-neu-card .btn-primary {
          border-radius: 9999px;
          background: linear-gradient(135deg, var(--brand), var(--brand-dark));
          box-shadow:
            -6px -6px 14px rgba(255, 255, 255, 0.035),
            6px 6px 16px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
          transition: box-shadow 0.12s ease, transform 0.12s ease;
        }
        .login-neu-card .btn-primary:active:not(:disabled) {
          box-shadow:
            inset 3px 3px 8px rgba(0, 0, 0, 0.4),
            inset -2px -2px 6px rgba(255, 255, 255, 0.03);
          transform: scale(0.99);
        }
        .login-neu-card .btn-primary:disabled {
          background: #22262f;
          box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.4);
        }
        @media (prefers-reduced-motion: reduce) {
          .login-neu-card .btn-primary {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

/** The brand mark, given real depth: ~16 copies of the same flat PNG
 * stacked a couple of pixels apart along Z, darkened toward the back —
 * once the stack tilts, those copies fan out into a visible edge, the
 * same way a stack of paper looks "thick" the moment you tilt it. A
 * moving highlight and a shadow cast onto the floor sell the rest. */
function LogoStack({ tiltX, tiltY }: { tiltX: number; tiltY: number }) {
  const LAYERS = 16;
  return (
    <div className="logo-perspective" aria-hidden="false">
      <div
        className="logo-rig"
        style={{
          transform: `rotateX(${18 - tiltY * 10}deg) rotateY(${tiltX * 14}deg)`,
        }}
      >
        <div className="logo-shadow" />
        {Array.from({ length: LAYERS }).map((_, i) => {
          const depth = i - LAYERS + 1; // most-negative at the back, 0 at the front
          const shade = 0.32 + (i / LAYERS) * 0.68;
          return (
            <img
              key={i}
              src="/brand-logo.png"
              alt={i === LAYERS - 1 ? "The Ray" : ""}
              className="logo-layer"
              style={{
                transform: `translateZ(${depth * 2.4}px)`,
                filter: `brightness(${shade}) saturate(${0.7 + shade * 0.5})`,
                opacity: i === LAYERS - 1 ? 1 : 0.92,
              }}
            />
          );
        })}
        <div className="logo-sheen" />
      </div>
      <style jsx>{`
        .logo-perspective {
          perspective: 900px;
          padding: 6px 0 14px;
        }
        .logo-rig {
          position: relative;
          width: 92px;
          height: 97px;
          margin: 0 auto;
          transform-style: preserve-3d;
          animation: logo-idle-float 5.5s ease-in-out infinite;
        }
        .logo-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          -webkit-user-select: none;
          user-select: none;
          pointer-events: none;
        }
        .logo-shadow {
          position: absolute;
          left: 50%;
          bottom: -34px;
          width: 70px;
          height: 16px;
          transform: translateX(-50%) translateZ(-40px) rotateX(90deg);
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55) 0%, transparent 72%);
          filter: blur(2px);
        }
        .logo-sheen {
          position: absolute;
          inset: 0;
          transform: translateZ(2px);
          background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.55) 46%, transparent 60%);
          background-size: 260% 260%;
          mix-blend-mode: overlay;
          animation: logo-sheen-sweep 4.2s ease-in-out infinite;
          pointer-events: none;
          /* Clipped to the logo's own silhouette (not a plain rectangle) —
             otherwise this blends against the page background outside the
             glyph and shows up as a visible ghost box. */
          -webkit-mask-image: url(/brand-logo.png);
          mask-image: url(/brand-logo.png);
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }
        @keyframes logo-idle-float {
          0%, 100% { transform: translateY(0) rotateZ(0deg); }
          50% { transform: translateY(-7px) rotateZ(1.2deg); }
        }
        @keyframes logo-sheen-sweep {
          0% { background-position: 120% 0%; }
          55%, 100% { background-position: -40% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-rig {
            animation: none;
          }
          .logo-sheen {
            animation: none;
            opacity: 0.15;
          }
        }
      `}</style>
    </div>
  );
}
