"use client";

/**
 * Genuine bill-completion sound — plays a clean two-note ascending
 * "ding" using the browser's own Web Audio API (no library, no file
 * download, works fully offline). The tone is a D5 → A5 perfect
 * fifth — the same interval used in classic cash registers and
 * point-of-sale terminals, so it genuinely SOUNDS like "sale done"
 * without being annoying. Decays naturally in ~0.6s.
 *
 * Silently does nothing if:
 *   - The browser doesn't support Web Audio (old browsers, some bots)
 *   - Audio is blocked (iOS/Android before first user gesture)
 *   - The user's device is on silent
 */
export function playBillSuccessSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    function playNote(frequency: number, startTime: number, duration: number, gain: number) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const now = ctx.currentTime;
    // D5 (587 Hz) — first note
    playNote(587.33, now, 0.35, 0.38);
    // A5 (880 Hz) — second note, ascending fifth, starts 0.18s later
    playNote(880, now + 0.18, 0.5, 0.3);

    // Close the audio context once done to release OS audio resources
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // Silently ignore — sound is a nice-to-have, never a blocker
  }
}
