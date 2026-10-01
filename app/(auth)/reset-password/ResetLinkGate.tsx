"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Words = { checking: string; expired: string; askAgain: string };

/** Turns the link from the reset email into a signed-in session, then shows the new-password form.
 * Handles every shape the link can come in — tokens after # (the email we send), a token_hash, or a
 * ?code= — and says plainly when the link is old or already used. */
export function ResetLinkGate({ children, words }: { children: React.ReactNode; words: Words }) {
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const query = new URLSearchParams(window.location.search);
      const linkError = hash.get("error_description") ?? query.get("error_description");
      try {
        if (linkError) throw new Error(linkError.replace(/\+/g, " "));
        // The client may already have read the link on its own while starting up.
        let { data } = await supabase.auth.getSession();
        if (!data.session) {
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          const tokenHash = query.get("token_hash");
          const code = query.get("code");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) throw error;
          } else if (tokenHash) {
            const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
            if (error) throw error;
          } else if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
          ({ data } = await supabase.auth.getSession());
        }
        // The tokens are spent; keep them out of the address bar and history.
        window.history.replaceState(null, "", "/reset-password");
        if (!cancelled) setState(data.session ? "ready" : "invalid");
      } catch (e) {
        if (!cancelled) {
          setReason((e as Error).message || null);
          setState("invalid");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "ready") return <>{children}</>;
  if (state === "checking") return <p className="py-6 text-center text-sm text-muted">{words.checking}</p>;
  return (
    <div className="flex flex-col gap-3 text-center">
      <p className="text-sm text-foreground">{words.expired}</p>
      {reason && <p className="text-xs text-muted">({reason})</p>}
      <Link href="/forgot-password" className="btn-primary text-center">
        {words.askAgain}
      </Link>
    </div>
  );
}
