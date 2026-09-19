"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n/dictionary";
import { Mic } from "lucide-react";
import { getSpeechRecognition, speechLocaleFor, voiceErrorMessages, type SpeechRecognitionLike } from "@/lib/speechRecognition";

export function SearchableSelect<T>({
  items,
  getLabel,
  getSubLabel,
  getKey,
  getKeywords,
  onSelect,
  onEnter,
  placeholder,
  leadingIcon,
  lang,
}: {
  items: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  getKey: (item: T) => string;
  /** Extra text to match that isn't shown, e.g. a barcode. */
  getKeywords?: (item: T) => string;
  onSelect: (item: T) => void;
  /** Runs first when Enter is pressed; return true if it handled the text
   * (e.g. a barcode from a scanner), so no list item is picked. */
  onEnter?: (query: string) => boolean;
  placeholder: string;
  leadingIcon?: ReactNode;
  lang?: Lang;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

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
          getSubLabel?.(i)?.toLowerCase().includes(q) ||
          getKeywords?.(i)?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query, getLabel, getSubLabel, getKeywords]);

  function choose(item: T) {
    onSelect(item);
    setQuery("");
    setHighlight(0);
    setOpen(false);
  }

  // Type-and-Enter billing: Enter adds the highlighted match (the first one
  // by default), arrows move through the list, Escape closes it.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (filtered.length ? (h + step + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      const text = query.trim();
      if (!text) return;
      e.preventDefault();
      if (onEnter?.(text)) {
        setQuery("");
        setHighlight(0);
        return;
      }
      const item = filtered[highlight] ?? filtered[0];
      if (item) choose(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{leadingIcon}</span>
      )}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
          setVoiceError(null);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        enterKeyHint="done"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        className={`w-full neu-card py-2.5 text-sm outline-none focus:border-brand ${leadingIcon ? "pl-10" : "pl-3.5"} ${voiceSupported ? "pr-10" : "pr-3.5"}`}
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
        <ul id={listId} role="listbox" className="absolute z-40 mt-1.5 flex max-h-72 w-full flex-col gap-1.5 overflow-y-auto p-0.5">
          {filtered.map((item, index) => (
            <li key={getKey(item)} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  inputRef.current?.blur();
                  choose(item);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm shadow-md ${
                  index === highlight && query.trim() ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand hover:bg-brand-soft"
                }`}
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
