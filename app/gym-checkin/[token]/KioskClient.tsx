"use client";

import { useEffect, useState, useTransition } from "react";
import { publicKioskCheckInAction } from "@/lib/actions/gym";

export function KioskClient({ token, shopName, shopLogoUrl }: { token: string; shopName: string; shopLogoUrl: string | null }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ error?: string; memberName?: string; alreadyIn?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-reset back to the entry screen a few seconds after a
  // check-in, so this tablet is always ready for the NEXT member
  // without anyone having to touch it in between.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      setResult(null);
      setPhone("");
    }, 4000);
    return () => clearTimeout(timer);
  }, [result]);

  function tapDigit(d: string) {
    if (phone.length >= 10) return;
    setPhone((p) => p + d);
  }
  function backspace() {
    setPhone((p) => p.slice(0, -1));
  }
  function submit() {
    startTransition(async () => {
      const res = await publicKioskCheckInAction(token, phone);
      setResult(res);
      if (!res.error) setPhone("");
    });
  }

  if (result && !result.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-soft to-background px-6 text-center">
        <p className="text-7xl">{result.alreadyIn ? "👋" : "✅"}</p>
        <p className="text-3xl font-bold text-foreground">{result.alreadyIn ? `Welcome back, ${result.memberName}!` : `Checked in, ${result.memberName}!`}</p>
        <p className="text-lg text-muted">{result.alreadyIn ? "You're already checked in today." : "Have a great workout! 💪"}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        {shopLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public kiosk, shop logo
          <img src={shopLogoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <p className="text-xl font-bold text-foreground">{shopName}</p>
        <p className="text-sm text-muted">Enter your phone number to check in</p>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={`flex h-11 w-7 items-center justify-center border-b-2 text-xl font-bold ${
              i < phone.length ? "border-brand text-foreground" : "border-border text-transparent"
            }`}
          >
            {phone[i] ?? "0"}
          </span>
        ))}
      </div>

      {result?.error && <p className="max-w-xs text-center text-sm text-danger">{result.error}</p>}

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => tapDigit(d)}
            className="rounded-2xl border border-border bg-surface py-5 text-2xl font-semibold text-foreground shadow-sm active:scale-95"
          >
            {d}
          </button>
        ))}
        <button onClick={backspace} className="rounded-2xl border border-border bg-surface py-5 text-lg font-semibold text-muted shadow-sm active:scale-95">
          ⌫
        </button>
        <button onClick={() => tapDigit("0")} className="rounded-2xl border border-border bg-surface py-5 text-2xl font-semibold text-foreground shadow-sm active:scale-95">
          0
        </button>
        <button onClick={() => setPhone("")} className="rounded-2xl border border-border bg-surface py-5 text-sm font-semibold text-muted shadow-sm active:scale-95">
          Clear
        </button>
      </div>

      <button
        onClick={submit}
        disabled={phone.length < 10 || isPending}
        className="w-full max-w-xs rounded-2xl py-4 text-lg font-bold text-white shadow-md disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
      >
        {isPending ? "Checking in…" : "✅ Check In"}
      </button>
    </div>
  );
}
