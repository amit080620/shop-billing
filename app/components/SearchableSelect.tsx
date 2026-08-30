"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n/dictionary";
import { Mic } from "lucide-react";
import { getSpeechRecognition, speechLocaleFor, voiceErrorMessages, type SpeechRecognitionLike } from "@/lib/speechRecognition";

export function SearchableSelect<T>({
  items,
  getLabel,
  getSubLabel,
  getKey,
  onSelect,
  placeholder,
  lang,
}: {
  items: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder: string;
  lang?: Lang;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
  }, []);

  function startVoiceSearch() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;
    setVoiceError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = speechLocaleFor(lang);
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setQuery(transcript);
        setOpen(true);
        setVoiceError(null);
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceError(voiceErrorMessages(lang).permission);
      } else if (event.error === "no-speech") {
        setVoiceError(voiceErrorMessages(lang).noSpeech);
      } else if (event.error === "network") {
        setVoiceError(voiceErrorMessages(lang).network);
      } else {
        setVoiceError(voiceErrorMessages(lang).generic);
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopVoiceSearch() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items
      .filter(
        (i) =>
          getLabel(i).toLowerCase().includes(q) ||
          getSubLabel?.(i)?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query, getLabel, getSubLabel]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setVoiceError(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`w-full neu-card px-3.5 py-2.5 text-sm outline-none focus:border-brand ${voiceSupported ? "pr-10" : ""}`}
      />
      {voiceSupported && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (listening ? stopVoiceSearch() : startVoiceSearch())}
          className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-sm ${
            listening ? "animate-pulse bg-danger text-white" : "text-muted"
          }`}
          aria-label="Search by voice"
        >
          <Mic size={14} />
        </button>
      )}
      {voiceError && (
        <p className="mt-1 text-xs text-danger">{voiceError}</p>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-40 mt-1.5 flex max-h-72 w-full flex-col gap-1.5 overflow-y-auto p-0.5">
          {filtered.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  inputRef.current?.blur();
                  onSelect(item);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-sm shadow-md hover:border-brand hover:bg-brand-soft"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {getLabel(item)}
                </span>
                {getSubLabel && (
                  <span className="shrink-0 text-xs text-muted">
                    {getSubLabel(item)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
