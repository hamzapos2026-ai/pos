// src/hooks/useSound.js
// ✅ FIXED FINAL v4 — speak + speakNumber added

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { playSound, initAudio } from "../services/soundService";

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

// ✅ Internal speech engine — cancel + speak
const _doSpeak = (text, lang = "en-US") => {
  if (!text) return;
  if (typeof window === "undefined") return;
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = lang;
    // Slightly slower for Urdu for clearer pronunciation
    utterance.rate = (lang === 'ur-PK' || lang === 'ur') ? 0.9 : 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* browser blocked — ignore */
  }
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

  // ── Sound effects ─────────────────────────────────────────
  const play = useCallback((name) => {
    if (!enabledRef.current) return;
    try { playSound(name); } catch { }
  }, []);

  // ✅ speak — koi bhi text, koi bhi language
  const speak = useCallback((text, lang = "en-US") => {
    if (!enabledRef.current) return;
    _doSpeak(text, lang);
  }, []);

  // ✅ speakNumber — sirf number bolega
  // "5" → "five" (en-US)
  // "5" → "5" (ur-PK)
  const speakNumber = useCallback((num, lang = "en-US") => {
    if (!enabledRef.current) return;
    if (num === null || num === undefined) return;
    _doSpeak(String(num), lang);
  }, []);

  // ✅ speakPriceQty — "100 times 2 equals 200"
  const speakPriceQty = useCallback((price, qty, lang = "en-US") => {
    if (!enabledRef.current) return;
    const p = Number(price || 0);
    const q = Number(qty || 0);
    const total = p * q;
    const isUrdu = lang === "ur-PK" || lang === "ur";
    const text = isUrdu
      ? `${p} ضرب ${q} برابر ${total}`
      : `${p} times ${q} equals ${total}`;
    _doSpeak(text, lang);
  }, []);

  // ── Named helpers ─────────────────────────────────────────
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

  return {
    isSoundEnabled,
    toggleSound,
    setSoundEnabled,
    play,
    speak,         // ✅ new
    speakNumber,   // ✅ new
    speakPriceQty, // ✅ new
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
  };
}

export default useSound;