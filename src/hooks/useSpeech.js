// src/hooks/useSpeech.js
// ✅ FIXED FINAL v3 + speakPriceQty added

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-hot-toast";

const SR =
  typeof window !== "undefined"
    ? window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null
    : null;

export const isSpeechSupported = !!SR;

// ── Number parsers ─────────────────────────────────────────────
const EN_ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const UR_ONES = {
  aik: 1, ek: 1, do: 2, teen: 3, chaar: 4, char: 4,
  paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7,
  sat: 7, aath: 8, ath: 8, nau: 9, das: 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14,
  pandrah: 15, solah: 16, satrah: 17, atharah: 18,
  unees: 19, unnees: 19,
};
const UR_TENS = {
  bees: 20, tees: 30, chaalees: 40, chalees: 40,
  pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

export const parseSpokenNumber = (text, lang = "en-US") => {
  if (!text) return null;
  const direct = parseFloat(
    String(text).replace(/,/g, "").trim()
  );
  if (!isNaN(direct) && direct >= 0) return Math.round(direct);

  const words = text.toLowerCase().trim().split(/[\s,\-]+/);
  const isUrdu = lang === "ur-PK" || lang === "ur";
  let total = 0,
    current = 0;

  for (const word of words) {
    if (!word) continue;
    if (isUrdu) {
      if (UR_ONES[word] !== undefined) current += UR_ONES[word];
      else if (UR_TENS[word] !== undefined)
        current += UR_TENS[word];
      else if (word === "sau" || word === "so") {
        if (!current) current = 1;
        current *= 100;
      } else if (word === "hazaar" || word === "hazar") {
        if (!current) current = 1;
        total += current * 1000;
        current = 0;
      } else if (word === "lakh" || word === "lac") {
        if (!current) current = 1;
        total += current * 100000;
        current = 0;
      } else {
        const d = parseFloat(word);
        if (!isNaN(d)) current += d;
      }
    } else {
      if (word === "and" || word === "a") continue;
      if (EN_ONES[word] !== undefined) current += EN_ONES[word];
      else if (EN_TENS[word] !== undefined)
        current += EN_TENS[word];
      else if (word === "hundred") {
        if (!current) current = 1;
        current *= 100;
      } else if (word === "thousand") {
        if (!current) current = 1;
        total += current * 1000;
        current = 0;
      } else if (word === "lakh" || word === "lac") {
        if (!current) current = 1;
        total += current * 100000;
        current = 0;
      } else if (word === "million") {
        if (!current) current = 1;
        total += current * 1000000;
        current = 0;
      } else {
        const d = parseFloat(word);
        if (!isNaN(d)) current += d;
      }
    }
  }
  total += current;
  return total > 0 ? total : null;
};

export const parseDiscount = (text, lang = "en-US") => {
  if (!text) return null;
  const lower = text.toLowerCase();
  const isPercent =
    lower.includes("percent") ||
    lower.includes("فیصد") ||
    lower.includes("%");
  const cleaned = lower
    .replace(/percent/g, "")
    .replace(/فیصد/g, "")
    .replace(/%/g, "")
    .trim();
  const value = parseSpokenNumber(cleaned, lang);
  if (value === null) return null;
  return {
    value: isPercent
      ? Math.min(100, Math.abs(value))
      : Math.abs(value),
    type: isPercent ? "percent" : "fixed",
  };
};

// ── Storage keys ───────────────────────────────────────────────
const _enabledKey = (uid) =>
  `aone_speech_enabled_${uid || "default"}`;
const _langKey = (uid) =>
  `aone_speech_lang_${uid || "default"}`;

// ══════════════════════════════════════════════════════════════
export function useSpeech() {
  const { userData } = useAuth();
  const userId = userData?.uid || "default";

  const [isSpeechEnabled, setIsSpeechEnabled] = useState(() => {
    try {
      return (
        localStorage.getItem(_enabledKey(userId)) === "true"
      );
    } catch {
      return false;
    }
  });

  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguageState] = useState(() => {
    try {
      return (
        localStorage.getItem(_langKey(userId)) || "en-US"
      );
    } catch {
      return "en-US";
    }
  });

  const recognitionRef = useRef(null);
  const callbackRef = useRef(null);
  const fieldRef = useRef("");
  const enabledRef = useRef(isSpeechEnabled);
  const listeningRef = useRef(false);
  const mountedRef = useRef(true);
  const transcriptTimer = useRef(null);

  useEffect(() => {
    enabledRef.current = isSpeechEnabled;
  }, [isSpeechEnabled]);

  useEffect(() => {
    listeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    try {
      const en =
        localStorage.getItem(_enabledKey(userId)) === "true";
      const lang =
        localStorage.getItem(_langKey(userId)) || "en-US";
      setIsSpeechEnabled(en);
      setLanguageState(lang);
      enabledRef.current = en;
    } catch { }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      _destroy();
    };
  }, []); // eslint-disable-line

  const _destroy = useCallback(() => {
    clearTimeout(transcriptTimer.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
        recognitionRef.current.abort();
      } catch { }
      recognitionRef.current = null;
    }
    if (mountedRef.current) {
      setIsListening(false);
      setActiveField("");
      listeningRef.current = false;
      fieldRef.current = "";
    }
  }, []);

  const toggleSpeech = useCallback(() => {
    if (!isSpeechSupported) {
      toast.error(
        "Speech recognition not supported. Try Chrome.",
        { duration: 3000 }
      );
      return;
    }
    setIsSpeechEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      try {
        localStorage.setItem(
          _enabledKey(userId),
          String(next)
        );
      } catch { }
      if (!next) _destroy();
      else
        toast.success(
          "🎤 Speech enabled! Click mic on any field.",
          { duration: 2000 }
        );
      return next;
    });
  }, [userId, _destroy]);

  const setLanguage = useCallback(
    (lang) => {
      setLanguageState(lang);
      try {
        localStorage.setItem(_langKey(userId), lang);
      } catch { }
      if (listeningRef.current) _destroy();
    },
    [userId, _destroy]
  );

  const stopListening = useCallback(
    () => _destroy(),
    [_destroy]
  );

  // ✅ ✅ ✅ SPEAK PRICE × QTY = TOTAL
  const speakPriceQty = useCallback(
    (price, qty) => {
      // ✅ Guard: dono hone chahiye
      if (!price || !qty) return;

      const p = Number(price);
      const q = Number(qty);
      const total = p * q;

      // ✅ Agar lang Urdu hai to Urdu me bolega
      const isUrdu =
        language === "ur-PK" || language === "ur";

      const text = isUrdu
        ? `${p} ضرب ${q} برابر ${total}` // Urdu text
        : `${p} times ${q} equals ${total}`; // English text

      try {
        // ✅ Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // ✅ Voice language set
        utterance.lang = isUrdu ? "ur-PK" : "en-US";
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;

        window.speechSynthesis.speak(utterance);
      } catch {
        /* browser blocks — ignore */
      }
    },
    [language]
  );

  // ✅ ✅ ✅ Custom text speak karo
  const speakText = useCallback((text) => {
    if (!text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        String(text)
      );
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch { }
  }, []);

  const startListening = useCallback(
    (fieldName, onResult) => {
      if (!isSpeechSupported) {
        toast.error("Speech not supported in this browser.");
        return;
      }
      if (!enabledRef.current) {
        toast("Enable speech first.", { icon: "🎤" });
        return;
      }

      _destroy();
      callbackRef.current = onResult;
      fieldRef.current = fieldName;

      try {
        const recognition = new SR();
        recognitionRef.current = recognition;
        recognition.lang = language;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          if (!mountedRef.current) return;
          setIsListening(true);
          setActiveField(fieldName);
          setTranscript("");
          listeningRef.current = true;
        };

        recognition.onresult = (e) => {
          if (!mountedRef.current) return;
          let interim = "",
            final = "";
          for (
            let i = e.resultIndex;
            i < e.results.length;
            i++
          ) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
          }
          if (interim) setTranscript(interim);
          if (final.trim()) {
            setTranscript(final.trim());
            if (callbackRef.current)
              callbackRef.current(final.trim());
            clearTimeout(transcriptTimer.current);
            transcriptTimer.current = setTimeout(() => {
              if (mountedRef.current) setTranscript("");
            }, 2000);
          }
        };

        recognition.onerror = (e) => {
          if (!mountedRef.current) return;
          switch (e.error) {
            case "not-allowed":
            case "permission-denied":
              toast.error(
                "🎤 Mic permission denied.",
                { duration: 4000 }
              );
              break;
            case "no-speech":
              break;
            case "network":
              toast.error("Speech needs internet.", {
                duration: 2000,
              });
              break;
            case "audio-capture":
              toast.error("No microphone found.", {
                duration: 3000,
              });
              break;
            case "aborted":
              break;
            default:
              console.warn("[useSpeech] error:", e.error);
          }
          if (mountedRef.current) {
            setIsListening(false);
            setActiveField("");
            listeningRef.current = false;
            fieldRef.current = "";
          }
        };

        recognition.onend = () => {
          if (!mountedRef.current) return;
          setIsListening(false);
          setActiveField("");
          listeningRef.current = false;
          fieldRef.current = "";
        };

        recognition.start();
      } catch (err) {
        console.error("[useSpeech] startListening:", err);
        toast.error("Could not start speech recognition.");
        _destroy();
      }
    },
    [language, _destroy]
  );

  return {
    isSpeechSupported,
    isSpeechEnabled,
    isListening,
    activeField,
    transcript,
    language,
    toggleSpeech,
    setLanguage,
    startListening,
    stopListening,
    speakText,      // ✅ new
    speakPriceQty,  // ✅ new — price × qty = total bolega
    parseSpokenNumber: (text) =>
      parseSpokenNumber(text, language),
    parseDiscount: (text) =>
      parseDiscount(text, language),
  };
}

export default useSpeech;