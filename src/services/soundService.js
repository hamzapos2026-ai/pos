/**
 * Sound Service
 * Handles audio playback for billing system
 * Supports: add, delete, payment, error, unlock, success sounds
 */

let audioContext = null;
let soundCache = {};

/**
 * Initialize Audio Context (required for Web Audio API)
 */
export const initAudio = () => {
  try {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      console.log("[initAudio] AudioContext initialized");
    }
    return audioContext;
  } catch (err) {
    console.error("[initAudio]", err);
    return null;
  }
};

/**
 * Generate beep tone using Web Audio API
 * @param {Number} frequency - Frequency in Hz (e.g., 800 for high, 400 for low)
 * @param {Number} duration - Duration in milliseconds
 * @param {Number} volume - Volume 0-1
 * @param {String} oscType - Oscillator wave type (sine, triangle, sawtooth, square)
 * @param {Number} endFrequency - Optional frequency to sweep to
 */
const playBeep = (frequency = 800, duration = 150, volume = 0.3, oscType = "sine", endFrequency = null) => {
  try {
    const ctx = initAudio();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = oscType;
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(Math.max(1, frequency), now);
    if (endFrequency !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration / 1000);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);

    osc.start(now);
    osc.stop(now + duration / 1000);
  } catch (err) {
    console.warn("[playBeep]", err.message);
  }
};

/**
 * Play sound effect
 * @param {String} type - Sound type (add, delete, error, unlock, paid, success, click, lock, clear, alert)
 * @param {Number} volume - Volume 0-1
 */
export const playSound = (type = "add", volume = 0.3) => {
  if (isMuted) return;

  // Normalize aliases
  let targetType = type.toLowerCase();
  if (targetType === "keypress") targetType = "click";
  if (targetType === "billsaved") targetType = "paid";
  if (targetType === "offline") targetType = "alert";
  if (targetType === "syncdone") targetType = "success";
  if (targetType === "warning") targetType = "alert";
  if (targetType === "payment") targetType = "paid";

  try {
    switch (targetType) {
      case "add":
        // High crisp beep
        playBeep(800, 100, volume);
        break;
      case "delete":
        // Medium warning beep
        playBeep(600, 150, volume);
        break;
      case "clear":
        // Descending clear tone sweep
        playBeep(600, 200, volume, "sine", 450);
        break;
      case "lock":
        // Descending locking sound
        playBeep(500, 250, volume, "sine", 350);
        break;
      case "unlock":
        // Ascending unlocking sound
        playBeep(700, 250, volume, "sine", 950);
        break;
      case "alert":
        // High double-pulse warning beeps (880Hz x2)
        playBeep(880, 100, volume);
        setTimeout(() => playBeep(880, 100, volume), 150);
        break;
      case "paid":
        // Multi-tone cash register ding
        playBeep(800, 80, volume);
        setTimeout(() => playBeep(1000, 80, volume), 80);
        setTimeout(() => playBeep(1300, 150, volume), 160);
        break;
      case "success":
        // Ascending major chord (C5 -> E5 -> G5)
        playBeep(523.25, 100, volume);
        setTimeout(() => playBeep(659.25, 100, volume), 100);
        setTimeout(() => playBeep(783.99, 150, volume), 200);
        break;
      case "error":
        // Low double-buzz (220Hz x2)
        playBeep(220, 150, volume, "triangle");
        setTimeout(() => playBeep(220, 150, volume, "triangle"), 200);
        break;
      case "click":
        // Short mechanical click sound
        playBeep(700, 50, volume, "sine");
        break;
      case "duplicate":
        // Double medium-low warning buzzes
        playBeep(450, 100, volume, "triangle");
        setTimeout(() => playBeep(450, 100, volume, "triangle"), 120);
        break;
      case "log":
        // Smooth, short ascending notification blips
        playBeep(600, 60, volume, "sine");
        setTimeout(() => playBeep(900, 60, volume, "sine"), 60);
        break;
      default:
        playBeep(800, 100, volume);
        break;
    }
  } catch (err) {
    console.warn(`[playSound] ${type}:`, err.message);
  }
};

/**
 * Play sound from URL (for pre-recorded audio)
 * @param {String} url - Audio file URL
 * @param {Number} volume - Volume 0-1
 */
export const playSoundFromUrl = async (url, volume = 0.5) => {
  try {
    const ctx = initAudio();
    if (!ctx) return;

    // Check cache
    if (soundCache[url]) {
      const source = ctx.createBufferSource();
      source.buffer = soundCache[url];
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = volume;
      source.start(ctx.currentTime);
      return;
    }

    // Fetch and decode
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Cache it
    soundCache[url] = audioBuffer;

    // Play it
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = volume;
    source.start(ctx.currentTime);
  } catch (err) {
    console.error("[playSoundFromUrl]", err);
  }
};

/**
 * Clear sound cache
 */
export const clearSoundCache = () => {
  soundCache = {};
};


/**
 * Mute/unmute
 */
let isMuted = false;
export const setMuted = (muted) => {
  isMuted = muted;
};

export const isSoundMuted = () => isMuted;

/**
 * Vocalize text using the browser's SpeechSynthesis API
 * @param {String} text - Text to speak
 * @param {String} lang - Language code (default 'en-US')
 */
export const speak = (text, lang = "en-US") => {
  if (isMuted) return;
  try {
    if (!window.speechSynthesis) {
      console.warn("[speak] SpeechSynthesis not supported in this browser");
      return;
    }
    // Cancel any ongoing speaking to prevent speech queuing backlog
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Handle error case
    utterance.onerror = (e) => {
      console.warn("[speak] SpeechSynthesisUtterance error:", e.error);
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("[speak] Error in speech synthesis:", err);
  }
};

/**
 * Vocalize counter update when a new serial is claimed
 * @param {String|Number} serial - The new serial number
 * @param {String} lang - Language code
 */
export const speakCounterUpdate = (serial, lang = "en-US") => {
  speak(`Counter updated to ${serial}`, lang);
};

/**
 * Vocalize standard numbers
 * @param {Number} num - Number to speak
 * @param {String} lang - Language code
 */
export const speakNumber = (num, lang = "en-US") => {
  speak(num.toString(), lang);
};

