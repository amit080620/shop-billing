"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveKioskSettingsAction } from "@/lib/actions/gym";
import { useToast } from "@/app/components/Toast";
import { PageHeader } from "@/app/components/PageHeader";
import { Tablet, MessageCircle } from "lucide-react";

export function KioskSettingsClient({ isEnabled: initialEnabled, publicToken }: { isEnabled: boolean; publicToken: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const publicUrl = publicToken && typeof window !== "undefined" ? `${window.location.origin}/gym-checkin/${publicToken}` : null;

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await saveKioskSettingsAction(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEnabled(next);
      showToast(next ? "Kiosk enabled" : "Kiosk disabled", "info");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Self check-in kiosk"
        subtitle="Leave this link open on a tablet or old phone at the entrance — members check themselves in by typing their phone number. No staff needed per member."
        icon={<Tablet size={18} strokeWidth={1.8} />}
      />
      <Link href="/gym/attendance" className="text-sm text-muted">
        ← Attendance
      </Link>

      <label className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm">
        <span className="text-sm font-medium text-foreground">Enable self check-in kiosk</span>
        <input type="checkbox" checked={isEnabled} onChange={(e) => toggle(e.target.checked)} disabled={isPending} className="h-5 w-5 rounded border-border" />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      {isEnabled && publicUrl && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-4">
          <p className="text-sm font-medium text-brand-dark">Kiosk link</p>
          <p className="break-all rounded-lg bg-surface px-3 py-2 text-xs text-foreground">{publicUrl}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-primary-sm flex-1 text-center"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Open this on the check-in tablet: ${publicUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-brand px-3 py-1.5 text-center text-xs font-medium text-brand-dark"
            >
              <span className="flex items-center gap-1"><MessageCircle size={13} /> Send to staff</span>
            </a>
          </div>
          <p className="text-xs text-brand-dark">
            Open this link on any spare tablet/phone at your entrance and leave it there — that&apos;s the whole setup.
          </p>
        </div>
      )}
    </div>
  );
}
