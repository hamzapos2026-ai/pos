// src/utils/activityContext.js
// Captures device + location + network context for EVERY activity log.
// Works fully offline — no network calls, no permission prompts (geo is best-effort cached).
// Attached to both online (Firestore) and offline (Dexie) logs so the Activity Logs
// dashboard can always show: device, browser/OS, location, timezone, date/time, offline tag.

import { getDeviceId } from './billIdGenerator';

const DEVICE_ID_KEY = 'aone_device_id';
const DEVICE_NAME_KEY = 'aone_device_name';
const GEO_CACHE_KEY = 'aone_last_geo';

/** Friendly browser + OS label from userAgent (offline-safe) */
const parseUserAgent = (ua = '') => {
  const s = String(ua);
  let os = 'Unknown OS';
  if (/Windows NT 10/.test(s)) os = 'Windows 10/11';
  else if (/Windows NT/.test(s)) os = 'Windows';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  let browser = 'Unknown Browser';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'Safari';

  return { os, browser, label: `${browser} · ${os}` };
};

const safeLS = (key) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};

/** Read last known geo (set opportunistically by captureGeoLocation, never blocks) */
const readCachedGeo = () => {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) return g;
  } catch { /* ignore */ }
  return null;
};

/**
 * Best-effort geolocation capture — call once after login (NOT on every log).
 * Silent: if user denies or it fails, we just keep whatever was cached before.
 */
export const captureGeoLocation = () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    if (sessionStorage.getItem('aone_geo_skip') === '1') return;
  } catch { /* ignore */ }
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            accuracy: Math.round(pos.coords.accuracy || 0),
            at: new Date().toISOString(),
          }));
        } catch { /* ignore */ }
      },
      () => {
        try { sessionStorage.setItem('aone_geo_skip', '1'); } catch { /* ignore */ }
      },
      { enableHighAccuracy: false, timeout: 1200, maximumAge: 900000 },
    );
  } catch { /* ignore */ }
};

/**
 * Synchronous context snapshot — safe to attach to every log entry.
 * @returns {object} device, network, locale + location metadata
 */
export const getActivityContext = () => {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const { os, browser, label } = parseUserAgent(ua);

  let timezone = '';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }

  let screenSize = '';
  try {
    if (typeof window !== 'undefined' && window.screen) {
      screenSize = `${window.screen.width}x${window.screen.height}`;
    }
  } catch { /* ignore */ }

  const geo = readCachedGeo();
  const now = new Date();

  let deviceId = 'unknown-device';
  try {
    if (typeof getDeviceId === 'function') {
      deviceId = getDeviceId();
    }
  } catch {
    deviceId = safeLS(DEVICE_ID_KEY) || 'unknown-device';
  }

  return {
    deviceId: deviceId || 'unknown-device',
    deviceName: safeLS(DEVICE_NAME_KEY) || label,
    deviceOS: os,
    deviceBrowser: browser,
    deviceInfo: label,
    userAgent: String(ua).slice(0, 160),
    platform: typeof navigator !== 'undefined' ? (navigator.platform || '') : '',
    screenSize,
    language: typeof navigator !== 'undefined' ? (navigator.language || '') : '',
    timezone,
    online,
    capturedOffline: !online,
    networkTag: online ? 'online' : 'offline',
    geo: geo ? `${geo.lat}, ${geo.lng}` : '',
    geoAccuracy: geo?.accuracy || null,
    localDate: now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
    localTime: now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    localISO: now.toISOString(),
  };
};

export default { getActivityContext, captureGeoLocation };
