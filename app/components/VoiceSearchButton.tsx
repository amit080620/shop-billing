"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { Lang } from "@/lib/i18n/dictionary";
import { getSpeechRecognition, speechLocaleFor, voiceErrorMessages, type SpeechRecognitionLike } from "@/lib/speechRecognition";

/** Mic button for a search box: speaks into `onResult`, shows its own
 * error line. Renders nothing where the browser has no speech support. */
export function VoiceSearchButton({ lang, onResult, className = "" }: { lang: Lang; onResult: (text: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => recognitionRef.current?.stop();
  }, []);

  function start() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setError(null);
    const recognition = new Ctor();
    recognition.lang = speechLocaleFor(lang);
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      if (text) onResult(text);
    };
    recognition.onerror = (event) => {
      setListening(false);
      const messages = voiceErrorMessages(lang);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setError(messages.permission);
      else if (event.error === "no-speech") setError(messages.noSpeech);
      else if (event.error === "network") setError(messages.network);
      else setError(messages.generic);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  if (!supported) return null;
  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (listening) {
            recognitionRef.current?.stop();
            setListening(false);
          } else start();
        }}
        aria-label="Search by voice"
        className={`flex h-8 w-8 items-center justify-center rounded-full ${listening ? "animate-pulse bg-danger text-white" : "text-muted hover:text-foreground"} ${className}`}
      >
        <Mic size={16} />
      </button>
      {error && <p className="absolute left-0 top-full mt-1 text-xs text-danger">{error}</p>}
    </>
  );
}
