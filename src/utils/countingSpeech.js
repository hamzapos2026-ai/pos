// countingSpeech.js — Urdu counting: "تین سو سے تین" format
// Full Fix: Async initialization for Windows & Chromebook + Backward Compatibility

const _toInt = (value) => {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const _clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const PHONETIC_0_99 = [
  'sifar',
  'ek', 'do', 'teen', 'char', 'paanch', 'chay', 'saat', 'aath', 'no',
  'dus', 'gyarah', 'barah', 'tayrah', 'chaudah', 'pandrah',
  'solah', 'satrah', 'atharah', 'unnees',
  'bees', 'ikkees', 'baees', 'tayees', 'chaubees', 'pachees',
  'chabees', 'sattaees', 'athaeis', 'untees',
  'tees', 'iktees', 'battees', 'taintees', 'chauntees', 'paintees',
  'chattees', 'saintees', 'adtees', 'unchalis',
  'chalis', 'iktalis', 'byalis', 'taintalis', 'chaubalis', 'paintalis',
  'chayalis', 'saintalis', 'adtalis', 'unchas',
  'pachas', 'ikawan', 'bawan', 'tirpan', 'chauban', 'pachpan',
  'chappan', 'satawan', 'athawan', 'unchath',
  'sath', 'iksath', 'basath', 'tirsath', 'chaubsath', 'pinsath',
  'chaysath', 'sadsath', 'adsath', 'unhattar',
  'sattar', 'ikhattar', 'bahattar', 'tihattar', 'chauhattar', 'pachattar',
  'chaihattar', 'satattar', 'athattar', 'unasi',
  'assi', 'ikasi', 'byasi', 'tirasi', 'chaurasi', 'pachasi',
  'chayasi', 'satasi', 'athasi', 'navasi',
  'nubbay', 'ikanvay', 'banvay', 'tiranvay', 'chauranvay', 'pachanvay',
  'chayanvay', 'satanvay', 'athanvay', 'ninavay',
];

const SCRIPT_0_99 = [
  'صفر',
  'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو',
  'دس', 'گیارہ', 'بارہ', 'تیرہ', 'چودہ', 'پندرہ', 'سولہ', 'سترہ', 'اٹھارہ', 'انیس',
  'بیس', 'اکیس', 'بائیس', 'تئیس', 'چوبیس', 'پچیس', 'چھبیس', 'ستائیس', 'اٹھائیس', 'انتیس',
  'تیس', 'اکتیس', 'بتیس', 'تینتیس', 'چونتیس', 'پینتیس', 'چھتیس', 'سینتیس', 'اڑتیس', 'انتالیس',
  'چالیس', 'اکتالیس', 'بیالیس', 'تینتالیس', 'چوالیس', 'پینتالیس', 'چھیالیس', 'سینتالیس', 'اڑتالیس', 'انچاس',
  'پچاس', 'اکاون', 'باون', 'ترپن', 'چون', 'پچپن', 'چھپن', 'ستاون', 'اٹھاون', 'انسٹھ',
  'ساٹھ', 'اکسٹھ', 'باسٹھ', 'تریسٹھ', 'چونسٹھ', 'پینسٹھ', 'چھیاسٹھ', 'سڑسٹھ', 'اڑسٹھ', 'انہتر',
  'ستر', 'اکہتر', 'بہتر', 'تہتر', 'چوہتر', 'پچھتر', 'چھہتر', 'ستتر', 'اٹھتر', 'اناسی',
  'اسی', 'اکاسی', 'بیاسی', 'تراسی', 'چوراسی', 'پچاسی', 'چھیاسی', 'ستاسی', 'اٹھاسی', 'نواسی',
  'نوے', 'اکانوے', 'بانوے', 'ترانوے', 'چورانوے', 'پچانوے', 'چھیانوے', 'ستانوے', 'اٹھانوے', 'ننانوے',
];

const CONNECT_SCRIPT = 'سے';
const CONNECT_EN     = 'to';

export const COUNTING_SPEED_MIN     = 0.75;
export const COUNTING_SPEED_MAX     = 1.75;
export const COUNTING_SPEED_DEFAULT = 1.15;
export const COUNTING_SPEED_STEP    = 0.05;

export const DEFAULT_COUNTING_SPEECH = {
  en: { rate: 1.2, pitch: 1.0 },
  ur: { rate: 1.0, pitch: 1.0 },
};

const _numberToWords = (value, table, labels) => {
  let n = _toInt(value);
  if (n === 0) return table[0];
  if (n > 999999999) return String(n);

  const parts = [];
  const { crore, laakh, hazaar, hundred } = labels;
  const under99 = (num) => table[num];

  const pushScaled = (amount, divisor, unit) => {
    const count = Math.floor(amount / divisor);
    if (count <= 0) return amount;
    if (count >= 100) {
      parts.push(_numberToWords(count, table, labels) + ' ' + unit);
    } else {
      parts.push(`${under99(count)} ${unit}`);
    }
    return amount % divisor;
  };

  n = pushScaled(n, 10000000, crore);
  n = pushScaled(n, 100000,   laakh);
  n = pushScaled(n, 1000,     hazaar);

  if (n >= 100) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    parts.push(`${under99(h)} ${hundred}`);
    if (r) parts.push(under99(r));
  } else if (n > 0) {
    parts.push(under99(n));
  }

  return _clean(parts.join(' '));
};

export const numberToUrduRoman = (value) =>
  _numberToWords(value, PHONETIC_0_99, {
    hundred: 'so', hazaar: 'hazaar', laakh: 'laakh', crore: 'crore',
  });

export const numberToUrduScript = (value) =>
  _numberToWords(value, SCRIPT_0_99, {
    hundred: 'سو', hazaar: 'ہزار', laakh: 'لاکھ', crore: 'کروڑ',
  });

export const buildUrduCountingVariants = (price, qty) => {
  const p = _toInt(price);
  const q = Math.max(1, _toInt(qty));
  return {
    script: _clean(`${numberToUrduScript(p)} ${CONNECT_SCRIPT} ${numberToUrduScript(q)}`),
    phonetic: _clean(`${numberToUrduRoman(p)} se ${numberToUrduRoman(q)}`),
  };
};

export const buildEnglishCountingPhrase = (price, qty) => {
  return _clean(`${_toInt(price)} ${CONNECT_EN} ${Math.max(1, _toInt(qty))}`);
};

// ─── Voice Engine — online + offline same Urdu quality ───────
let _speakGen = 0;
let _cachedVoices = [];
let _boundProfile = null;

const OFFLINE_HINDI_PREF = 'aone_offline_hindi_voice_v1';
const ONLINE_URDU_PREF = 'aone_online_urdu_voice_v1';

const _isOnline = () => typeof navigator !== 'undefined' && navigator.onLine;

const _isLocalVoice = (v) => {
  if (!v) return false;
  if (v.localService === true) return true;
  const n = String(v.name || '').toLowerCase();
  if (/online|cloud|preview|neural/i.test(n)) return false;
  return /microsoft|windows|google/i.test(n);
};

const _voiceUsable = (v) => v && (_isLocalVoice(v) || _isOnline());

const _refreshVoices = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  const list = window.speechSynthesis.getVoices() || [];
  if (list.length > 0) _cachedVoices = list;
  return _cachedVoices.length > 0 ? _cachedVoices : list;
};

const _loadPref = (key) => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch { return null; }
};

const _savePref = (key, voice) => {
  if (!voice?.name) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      name: voice.name, lang: voice.lang || '', voiceURI: voice.voiceURI || '',
    }));
  } catch { /* ignore */ }
};

const _findByPref = (list, pref) => {
  if (!pref || !list?.length) return null;
  if (pref.voiceURI) { const v = list.find((x) => x.voiceURI === pref.voiceURI); if (v) return v; }
  if (pref.name) { const v = list.find((x) => x.name === pref.name); if (v) return v; }
  return null;
};

const _profile = (voice, type, useScript, langTag, pitch, mode) => ({
  voice,
  type,
  useScript,
  langTag,
  pitch: pitch ?? 1.0,
  source: type,
  label: voice?.name || '',
  mode,
});

/** Local Hindi for offline — Kalpana / Hemant (Urdu accent, not English). */
const _pickOfflineHindi = (list) => {
  const local = list.filter((v) => _isLocalVoice(v) && _voiceUsable(v));
  const pref = _findByPref(local, _loadPref(OFFLINE_HINDI_PREF));
  if (pref) return pref;
  const by = (re) => local.find((v) => re.test(String(v.name || '').toLowerCase()));
  return by(/kalpana|swara|heera|google.*hindi/)
    || by(/hemant|madhur|ravi/)
    || local.find((v) => /^hi/i.test(v.lang))
    || null;
};

/** Urdu voice — local first (offline OK), then cloud when online. */
const _pickUrduVoice = (list, online) => {
  const usable = list.filter(_voiceUsable);

  const pref = _findByPref(usable, _loadPref(ONLINE_URDU_PREF));
  if (pref && (/^ur/i.test(pref.lang) || /uzma|urdu/i.test(pref.name || ''))) {
    if (_isLocalVoice(pref) || online) return pref;
  }

  const localUr = usable.find(
    (v) => _isLocalVoice(v) && (/uzma/i.test(v.name || '') || (/^ur/i.test(v.lang) && !/asad|male/i.test(v.name || ''))),
  );
  if (localUr) return localUr;

  if (online) {
    return usable.find((v) => /uzma/i.test(v.name || ''))
      || usable.find((v) => /google/i.test(v.name || '') && /^ur/i.test(v.lang))
      || usable.find((v) => /^ur/i.test(v.lang) || /urdu/i.test(String(v.name || '').toLowerCase()))
      || null;
  }

  return null;
};

/**
 * Online  → Urdu script + Uzma/Google Urdu
 * Offline → local Uzma + script (same) OR Hindi + roman (never English "300 seek")
 */
export const pickUrduCountingVoice = (voicesList) => {
  const list = voicesList?.length ? voicesList : _refreshVoices();
  const online = _isOnline();
  const mode = online ? 'online' : 'offline';

  const urdu = _pickUrduVoice(list, online);
  if (urdu) {
    _savePref(ONLINE_URDU_PREF, urdu);
    return _profile(urdu, _isLocalVoice(urdu) ? 'local-urdu' : 'cloud-urdu', true, urdu.lang || 'ur-PK', 1.02, mode);
  }

  const hindi = _pickOfflineHindi(list);
  if (hindi) {
    _savePref(OFFLINE_HINDI_PREF, hindi);
    return _profile(hindi, 'offline-hindi', false, hindi.lang || 'hi-IN', 1.0, mode);
  }

  return _profile(null, online ? 'ur-lang' : 'hi-lang', online, online ? 'ur-PK' : 'hi-IN', 1.0, mode);
};

const _rebind = () => {
  _boundProfile = pickUrduCountingVoice(_refreshVoices());
  return _boundProfile;
};

export const ensureVoicesReady = () => {
  return new Promise((resolve) => {
    const list = _refreshVoices();
    if (list.length > 0) return resolve(list);

    let attempts = 0;
    const interval = setInterval(() => {
      const updatedList = _refreshVoices();
      attempts++;
      if (updatedList.length > 0 || attempts >= 50) {
        clearInterval(interval);
        resolve(updatedList);
      }
    }, 50);
  });
};

export const bindUrduCountingVoice = () => _rebind().voice;

export const speakCountingPhrase = async (price, qty, lang = 'en', options = {}) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;

  const myGen = options.speakGen ?? ++_speakGen;
  _speakGen = myGen;
  const isUrdu = String(lang || '').toLowerCase().startsWith('ur');
  const userOpts = {
    rate: Number(options.rate) || (isUrdu ? DEFAULT_COUNTING_SPEECH.ur.rate : DEFAULT_COUNTING_SPEECH.en.rate),
    pitch: Number(options.pitch) || 1.0
  };

  try {
    const synth = window.speechSynthesis;
    
    // پرانی آڈیو کینسل کریں اور ہلکا سا بریک دیں
    synth.cancel();
    await new Promise(r => setTimeout(r, 40));

    const currentVoices = await ensureVoicesReady();
    if (myGen !== _speakGen) return false;

    const u = new SpeechSynthesisUtterance();
    u.rate = userOpts.rate;
    u.pitch = userOpts.pitch;

    if (isUrdu) {
      const variants = buildUrduCountingVariants(price, qty);
      const voiceProfile = _boundProfile || pickUrduCountingVoice(currentVoices);

      u.text = voiceProfile.useScript ? variants.script : variants.phonetic;
      u.lang = voiceProfile.langTag;
      u.pitch = voiceProfile.pitch ?? userOpts.pitch;

      if (voiceProfile.voice) {
        u.voice = voiceProfile.voice;
        u.lang = voiceProfile.voice.lang || voiceProfile.langTag;
      }
    } else {
      u.text = buildEnglishCountingPhrase(price, qty);
      const enVoice = currentVoices.find(v => /^en/i.test(v.lang)) || currentVoices[0];
      if (enVoice) {
        u.voice = enVoice;
        u.lang = enVoice.lang;
      }
    }

    return new Promise((resolve) => {
      u.onend = () => resolve(true);
      u.onerror = (err) => {
        console.warn('[CountingSpeech] TTS error:', err);
        resolve(false);
      };
      
      synth.speak(u);
      
      // آواز ہینگ ہونے کی صورت میں سیفٹی ٹائم آؤٹ
      setTimeout(() => {
        if (synth.speaking && myGen === _speakGen) {
          resolve(false);
        }
      }, 7000);
    });

  } catch (e) {
    console.error('[CountingSpeech] Fatal system error:', e);
    return false;
  }
};

export const previewCountingSpeech = (lang = 'ur', options = {}) => {
  return speakCountingPhrase(300, 3, lang, options);
};

// ─── Backward-compatible exports (useSound, BillerDashboard, main.jsx) ───
export const ensureSpeechVoices = ensureVoicesReady;

export const ensureUrduVoicesReady = async (maxWaitMs = 1200) => {
  let list = await ensureVoicesReady();
  const ready = (voices) => {
    if (_pickUrduVoice(voices, _isOnline())) return true;
    return voices.some(
      (v) => _isLocalVoice(v) && (/^hi/i.test(v.lang) || /hindi|kalpana|hemant|swara/i.test(String(v.name || '').toLowerCase())),
    );
  };
  if (ready(list)) return list;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 80));
    list = _refreshVoices();
    if (ready(list)) return list;
  }
  return _refreshVoices();
};

export const primeSpeechEngine = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    const profile = _rebind();
    const u = new SpeechSynthesisUtterance('\u200b');
    u.volume = 0.01;
    u.rate = 2;
    if (profile.voice) u.voice = profile.voice;
    u.lang = profile.langTag || 'ur-PK';
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
};

export const refreshCountingVoices = () => {
  _refreshVoices();
  _rebind();
  return ensureVoicesReady();
};

export const resolveCountingSpeechOpts = (lang = 'en', overrides = {}) => {
  const isUrdu = /^ur/i.test(String(lang || ''));
  const base = isUrdu ? DEFAULT_COUNTING_SPEECH.ur : DEFAULT_COUNTING_SPEECH.en;
  const rate = Number(overrides.rate);
  const pitch = Number(overrides.pitch);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : base.rate,
    pitch: Number.isFinite(pitch) && pitch > 0 ? pitch : base.pitch,
  };
};

export const buildCountingPhrase = (price, qty, lang = 'en') => {
  const isUrdu = /^ur/i.test(String(lang || ''));
  if (isUrdu) return buildUrduCountingVariants(price, qty).script;
  return buildEnglishCountingPhrase(price, qty);
};

export const buildCountingParts = (price, qty, lang = 'en') => [
  buildCountingPhrase(price, qty, lang),
];

export const pickSpeechVoice = (lang, voices) => {
  const list = voices?.length ? voices : _refreshVoices();
  if (/^ur/i.test(String(lang || ''))) return pickUrduCountingVoice(list).voice;
  return list.find((v) => /^en/i.test(v.lang)) || list[0] || null;
};

export const pickMaleUrduVoice = (voices) => pickUrduCountingVoice(voices).voice;

export const debugVoices = () => {
  const voices = _refreshVoices();
  console.log('=== VOICE DEBUG ===');
  console.log('Online:', _isOnline());
  console.log('Total voices:', voices.length);
  voices.forEach((v, i) => console.log(`${i + 1}. ${v.name} | ${v.lang} | local:${v.localService}`));
  const profile = pickUrduCountingVoice(voices);
  console.log('Urdu profile:', profile);
  console.log('===================');
  return profile;
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
  _refreshVoices();
  _rebind();
  const onChange = () => { _refreshVoices(); _rebind(); };
  if (window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
  }
  window.addEventListener('online', onChange);
  window.addEventListener('offline', () => { _boundProfile = null; onChange(); });
}

export default {
  speakCountingPhrase,
  previewCountingSpeech,
  buildUrduCountingVariants,
  buildEnglishCountingPhrase,
  buildCountingPhrase,
  buildCountingParts,
  pickUrduCountingVoice,
  bindUrduCountingVoice,
  ensureVoicesReady,
  ensureSpeechVoices,
  ensureUrduVoicesReady,
  primeSpeechEngine,
  refreshCountingVoices,
  resolveCountingSpeechOpts,
  pickSpeechVoice,
  pickMaleUrduVoice,
  debugVoices,
  numberToUrduRoman,
  numberToUrduScript,
  COUNTING_SPEED_MIN,
  COUNTING_SPEED_MAX,
  COUNTING_SPEED_DEFAULT,
  COUNTING_SPEED_STEP,
  DEFAULT_COUNTING_SPEECH,
};