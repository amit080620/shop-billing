import type { Lang } from "@/lib/i18n/dictionary";

// Web Speech API isn't in TypeScript's default DOM lib — minimal shape
// for what's actually used across the app.
export interface SpeechRecognitionResultLike {
  transcript: string;
}
export interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
export interface SpeechRecognitionErrorLike extends Event {
  error: string;
}
export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Locking recognition to en-IN regardless of what the person is actually
// speaking is why voice search "doesn't work" for Hindi/Marathi users —
// match it to the app's selected language instead.
export function speechLocaleFor(lang?: Lang) {
  if (lang === "hi") return "hi-IN";
  if (lang === "mr") return "mr-IN";
  return "en-IN";
}

export function voiceErrorMessages(lang?: Lang) {
  if (lang === "hi") {
    return {
      permission: "माइक की अनुमति नहीं मिली — फ़ोन की Settings में इस साइट को Microphone की अनुमति दें।",
      noSpeech: "कुछ सुनाई नहीं दिया — दोबारा कोशिश करें।",
      network: "Internet नहीं मिला — voice search के लिए connection चाहिए।",
      generic: "Voice search नहीं चल पाया — दोबारा कोशिश करें।",
    };
  }
  if (lang === "mr") {
    return {
      permission: "माइकला परवानगी मिळाली नाही — फोनच्या Settings मध्ये या साइटला Microphone परवानगी द्या.",
      noSpeech: "काही ऐकू आले नाही — पुन्हा प्रयत्न करा.",
      network: "Internet मिळाले नाही — voice search साठी connection आवश्यक आहे.",
      generic: "Voice search चालले नाही — पुन्हा प्रयत्न करा.",
    };
  }
  return {
    permission: "Microphone permission was denied — allow it for this site in your phone's Settings.",
    noSpeech: "Didn't catch that — try again.",
    network: "No internet connection — voice search needs one.",
    generic: "Voice search couldn't start — please try again.",
  };
}
