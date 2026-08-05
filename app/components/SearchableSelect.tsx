"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Web Speech API isn't in TypeScript's default DOM lib — minimal shape for
// what's actually used here.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function SearchableSelect<T>({
  items,
  getLabel,
  getSubLabel,
  getKey,
  onSelect,
  placeholder,
}: {
  items: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
  }, []);

  function startVoiceSearch() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setQuery(transcript);
        setOpen(true);
      }
    };
    recognition.onerror = () => setListening(false);
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
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-surface shadow-sm px-3.5 py-2.5 text-sm outline-none focus:border-brand ${voiceSupported ? "pr-10" : ""}`}
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
          🎤
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {filtered.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-brand-soft"
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
