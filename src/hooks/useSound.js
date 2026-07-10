// src/hooks/useSound.js

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { playSound, initAudio } from "../services/soundService";
import {
  speakCountingPhrase,
  ensureSpeechVoices,
  ensureUrduVoicesReady,
  primeSpeechEngine,
  bindUrduCountingVoice,
  pickSpeechVoice,
  pickUrduCountingVoice,
  DEFAULT_COUNTING_SPEECH,
} from "../utils/countingSpeech";

const _storageKey = (uid) => `aone_sound_enabled_${uid || "default"}`;

export const SOUNDS = {
  ADD: "add",
  DELETE: "delete",
  ERROR: "error",
  UNLOCK: "unlock",
  LOCK: "lock",
  PAID: "paid",
  PRINT: "print",
  NEW_BILL: "add",
  BILL_SAVED: "paid",
  OFFLINE: "error",
  SYNC_DONE: "paid",
  KEY_PRESS: "add",
  BARCODE: "print",
  WARNING: "error",
};

const _readEnabled = (uid) => {
  try {
    const stored = localStorage.getItem(_storageKey(uid));
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
};

const _writeEnabled = (uid, val) => {
  try {
    localStorage.setItem(_storageKey(uid), String(val));
  } catch { }
};

const _doSpeak = (text, lang = "en-US") => {
  if (!text) return;
  if (typeof window === "undefined") return;
  if (!window.speechSynthesis) return;

  const isUrdu = lang === "ur-PK" || lang === "ur";

  ensureSpeechVoices().then((voices) => {
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();

      const picked = isUrdu
        ? pickUrduCountingVoice(voices)
        : {
            voice: pickSpeechVoice(lang, voices),
            langTag: lang,
            pitch: DEFAULT_COUNTING_SPEECH.en.pitch,
          };

      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = picked.langTag || picked.voice?.lang || (isUrdu ? "ur-PK" : lang);
      if (picked.voice) utterance.voice = picked.voice;

      utterance.rate = isUrdu ? DEFAULT_COUNTING_SPEECH.ur.rate : DEFAULT_COUNTING_SPEECH.en.rate;
      utterance.pitch = isUrdu
        ? (picked.pitch ?? DEFAULT_COUNTING_SPEECH.ur.pitch)
        : DEFAULT_COUNTING_SPEECH.en.pitch;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* browser blocked — ignore */
    }
  });
};

export function useSound() {
  const { userData } = useAuth();
  const userId = userData?.uid || "default";

  const [isSoundEnabled, setIsSoundEnabled] = useState(
    () => _readEnabled(userId),
  );

  const enabledRef = useRef(isSoundEnabled);
  useEffect(() => {
    enabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  useEffect(() => {
    try { initAudio(); } catch { }
    ensureSpeechVoices()
      .then(() => {
        bindUrduCountingVoice();
        primeSpeechEngine();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const val = _readEnabled(userId);
    setIsSoundEnabled(val);
    enabledRef.current = val;
  }, [userId]);

  const toggleSound = useCallback(() => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      _writeEnabled(userId, next);
      if (next) {
        try { playSound(SOUNDS.UNLOCK); } catch { }
      }
      return next;
    });
  }, [userId]);

  const setSoundEnabled = useCallback((val) => {
    const next = Boolean(val);
    setIsSoundEnabled(next);
    enabledRef.current = next;
    _writeEnabled(userId, next);
  }, [userId]);

  const play = useCallback((name) => {
    if (!enabledRef.current) return;
    try { playSound(name); } catch { }
  }, []);

  const speak = useCallback((text, lang = "en-US") => {
    if (!enabledRef.current) return;
    _doSpeak(text, lang);
  }, []);

  const speakNumber = useCallback((num, lang = "en-US") => {
    if (!enabledRef.current) return;
    if (num === null || num === undefined) return;
    _doSpeak(String(num), lang);
  }, []);

  const speakPriceQty = useCallback((price, qty, lang = "en-US", options = {}) => {
    const force = options?.force === true;
    if (!force && !enabledRef.current) return;
    const phraseLang = /^ur/i.test(String(lang)) ? "ur" : "en";
    const { rate, pitch } = options;
    void speakCountingPhrase(price, qty, phraseLang, { rate, pitch });
  }, []);

  const speakCounting = speakPriceQty;

  const playAdd = useCallback(() => play(SOUNDS.ADD), [play]);
  const playDelete = useCallback(() => play(SOUNDS.DELETE), [play]);
  const playError = useCallback(() => play(SOUNDS.ERROR), [play]);
  const playUnlock = useCallback(() => play(SOUNDS.UNLOCK), [play]);
  const playLock = useCallback(() => play(SOUNDS.LOCK), [play]);
  const playPaid = useCallback(() => play(SOUNDS.PAID), [play]);
  const playPrint = useCallback(() => play(SOUNDS.PRINT), [play]);
  const playNewBill = useCallback(() => play(SOUNDS.NEW_BILL), [play]);
  const playBillSaved = useCallback(() => play(SOUNDS.BILL_SAVED), [play]);
  const playOffline = useCallback(() => play(SOUNDS.OFFLINE), [play]);
  const playSyncDone = useCallback(() => play(SOUNDS.SYNC_DONE), [play]);
  const playKeyPress = useCallback(() => play(SOUNDS.KEY_PRESS), [play]);
  const playBarcode = useCallback(() => play(SOUNDS.BARCODE), [play]);
  const playWarning = useCallback(() => play(SOUNDS.WARNING), [play]);
  const playLog = useCallback(() => play("log"), [play]);

  return {
    isSoundEnabled,
    toggleSound,
    setSoundEnabled,
    play,
    speak,
    speakNumber,
    speakPriceQty,
    speakCounting,
    playAdd,
    playDelete,
    playError,
    playUnlock,
    playLock,
    playPaid,
    playPrint,
    playNewBill,
    playBillSaved,
    playOffline,
    playSyncDone,
    playKeyPress,
    playBarcode,
    playWarning,
    playLog,
  };
}

export default useSound;
