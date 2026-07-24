"use client";

export function WatchTourButton({ shopId, label = "🎬 Watch tour again" }: { shopId: string; label?: string }) {
  function replay() {
    try {
      localStorage.removeItem(`tour-seen-${shopId}`);
    } catch {
      // localStorage unavailable — nothing to clear, the button just won't do anything useful
    }
    // A full navigation (not client-side routing) so the layout — and the
    // tour inside it — actually remounts and re-checks the flag.
    window.location.href = "/";
  }

  return (
    <button
      onClick={replay}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
    >
      {label}
    </button>
  );
}
