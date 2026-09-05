"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { testRedisConnectionAction, type RedisTestResult } from "@/lib/actions/redisTest";

export function RedisStatusClient() {
  const [result, setResult] = useState<RedisTestResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function runTest() {
    setIsLoading(true);
    const r = await testRedisConnectionAction();
    setResult(r);
    setIsLoading(false);
  }

  useEffect(() => {
    runTest();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-sm">Redis se genuinely connect karke test kar rahe hain…</p>
      </div>
    );
  }

  if (!result) return null;

  const success = result.connected && result.writeReadOk;

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-col items-center gap-2 rounded-2xl p-6 text-center text-white ${success ? "bg-gradient-to-br from-success to-emerald-700" : "bg-gradient-to-br from-danger to-[#7c1d1d]"}`}>
        {success ? <CheckCircle2 size={36} /> : <XCircle size={36} />}
        <p className="text-lg font-bold">{success ? "Connected ✅" : "Connect Nahi Hua ❌"}</p>
        <p className="text-xs opacity-90">{success ? "Redis mein genuinely likha aur wapas padha gaya — sab kaam kar raha hai." : "Neeche exact wajah dekhein"}</p>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <Row label="Environment variables mile" ok={result.envVarsFound} />
        {result.urlPreview && <Row label={`URL: ${result.urlPreview}`} ok={true} neutral />}
        <Row label="Redis se connection bana" ok={result.connected} />
        <Row label="Write + Read test pass hua" ok={result.writeReadOk} />
      </div>

      {result.error && (
        <div className="neu-card flex flex-col gap-1.5 p-4">
          <p className="text-sm font-semibold text-danger">Exact error:</p>
          <p className="text-xs text-foreground">{result.error}</p>
        </div>
      )}

      <button onClick={runTest} className="flex items-center justify-center gap-1.5 rounded-lg border border-brand px-3 py-2.5 text-sm font-medium text-brand">
        <RotateCcw size={14} /> Dobara test karein
      </button>
    </div>
  );
}

function Row({ label, ok, neutral }: { label: string; ok: boolean; neutral?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {neutral ? (
        <span className="h-4 w-4 shrink-0 rounded-full bg-surface-2" />
      ) : ok ? (
        <CheckCircle2 size={16} className="shrink-0 text-success" />
      ) : (
        <XCircle size={16} className="shrink-0 text-danger" />
      )}
      <span className="break-all text-foreground">{label}</span>
    </div>
  );
}
