"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { publicKioskCheckInAction, type KioskMembershipStatus } from "@/lib/actions/gym";
import { Hand, CheckCircle2, AlertTriangle } from "lucide-react";

type CheckinResult = { error?: string; memberName?: string; alreadyIn?: boolean; membershipStatus?: KioskMembershipStatus; daysLeft?: number | null; planName?: string | null };

export function KioskClient({ token, shopName, shopLogoUrl }: { token: string; shopName: string; shopLogoUrl: string | null }) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // Auto-reset back to the entry screen a few seconds after a
  // check-in, so this tablet is always ready for the NEXT member
  // without anyone having to touch it in between. A renewal warning
  // gets a bit longer on screen, since it's actually worth reading.
  useEffect(() => {
    if (!result) return;
    const needsAttention = result.membershipStatus === "expired" || result.membershipStatus === "expiring_soon";
    const timer = setTimeout(() => {
      setResult(null);
      setPhone("");
    }, needsAttention ? 7000 : 4000);
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
    const expired = result.membershipStatus === "expired";
    const expiringSoon = result.membershipStatus === "expiring_soon";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-soft to-background px-6 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full text-white" style={{ background: "var(--brand)" }}>
          {result.alreadyIn ? <Hand size={48} /> : <CheckCircle2 size={48} />}
        </span>
        <p className="text-3xl font-bold text-foreground">{result.alreadyIn ? `Welcome back, ${result.memberName}!` : `Checked in, ${result.memberName}!`}</p>
        <p className="text-lg text-muted">{result.alreadyIn ? "You're already checked in today." : "Have a great workout!"}</p>
        {(expired || expiringSoon) && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${expired ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-warning"}`}>
            <AlertTriangle size={18} className="shrink-0" />
            <p className="text-sm font-medium">
              {expired ? "Your membership has expired — please see the desk to renew." : `Your membership expires in ${result.daysLeft} day${result.daysLeft === 1 ? "" : "s"} — renew soon.`}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        {shopLogoUrl && (
          <Image src={shopLogoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
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
        style={{ background: "var(--brand)" }}
      >
        {isPending ? "Checking in…" : "Check In"}
      </button>
    </div>
  );
}
