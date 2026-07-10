// Device registry — labels, filter options, Firestore sync for real POS terminals

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseReady } from '../services/firebase';
import { getActivityContext } from './activityContext';

export const DEVICE_ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min = online

/** Friendly label for a device record (Firestore or log-derived) */
export const getDeviceLabel = (dev, fallbackId = '') => {
  if (!dev) return fallbackId || 'Unknown Device';
  return (
    dev.operatorName
    || dev.deviceName
    || dev.name
    || (dev.billerCode ? `${dev.billerCode}${dev.branchCode ? ` · ${dev.branchCode}` : ''}` : '')
    || dev.clientOS
    || dev.deviceInfo
    || dev.id
    || fallbackId
    || 'Unknown Device'
  );
};

/** Parse userAgent into browser · OS (for log display) */
export const formatUserAgentLabel = (ua = '') => {
  const s = String(ua);
  if (!s || s.length < 8) return '';
  let os = 'Unknown OS';
  if (/Windows NT 10/.test(s)) os = 'Windows';
  else if (/Windows NT/.test(s)) os = 'Windows';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(s)) os = 'iOS';
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) && !/Edg\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'Safari';

  return `${browser} · ${os}`;
};

/** Resolve label for an activity log row */
export const resolveLogDeviceLabel = (log, devicesMap = {}) => {
  if (!log) return '—';

  const rawName = log.deviceName || '';
  if (rawName && !/^Mozilla/i.test(rawName)) return rawName;

  if (log.deviceBrowser && log.deviceOS) {
    return `${log.deviceBrowser} · ${log.deviceOS}`;
  }

  const fromMap = log.deviceId ? getDeviceLabel(devicesMap[log.deviceId], log.deviceId) : '';
  if (fromMap && fromMap !== log.deviceId && !/^Mozilla/i.test(fromMap)) return fromMap;

  const uaLabel = formatUserAgentLabel(log.deviceInfo || log.userAgent || '');
  if (uaLabel) return uaLabel;

  if (log.deviceId && log.deviceId !== 'unknown-device') {
    const short = String(log.deviceId).replace(/^dev_/, '').slice(0, 12);
    return short ? `Terminal ${short}` : log.deviceId;
  }

  return '—';
};

/** Build device filter dropdown — Firestore + local + devices seen in activity logs */
export const mergeDeviceFilterOptions = (devicesMap = {}, logs = []) => {
  const map = new Map();

  Object.entries(devicesMap).forEach(([id, dev]) => {
    if (id) map.set(id, getDeviceLabel(dev, id));
  });

  getLocalDevices().forEach((dev) => {
    if (dev?.id && !map.has(dev.id)) {
      map.set(dev.id, getDeviceLabel(dev, dev.id));
    }
  });

  (logs || []).forEach((log) => {
    const id = log?.deviceId;
    if (id && id !== 'unknown-device') {
      if (!map.has(id)) {
        map.set(id, resolveLogDeviceLabel(log, devicesMap));
      }
      return;
    }
    const name = log?.deviceName || log?.deviceInfo;
    if (name && name !== '—') {
      const key = `name:${String(name).slice(0, 60)}`;
      if (!map.has(key)) map.set(key, String(name).slice(0, 48));
    }
  });

  return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
};

export const isDeviceOnline = (lastActiveAt, fallbackIsOnline) => {
  if (lastActiveAt) {
    const ts = lastActiveAt?.toDate?.()
      ? lastActiveAt.toDate().getTime()
      : lastActiveAt?.seconds
        ? lastActiveAt.seconds * 1000
        : new Date(lastActiveAt).getTime();
    if (Number.isFinite(ts)) {
      return Date.now() - ts < DEVICE_ONLINE_WINDOW_MS;
    }
  }
  return Boolean(fallbackIsOnline);
};

/**
 * Upsert current session device to Firestore — real terminal, not mock.
 * Called on login so /admin/devices and audit-logs stay in sync.
 */
export const syncSessionDeviceToFirestore = async (userData, deviceId, billerCode) => {
  if (!isFirebaseReady() || !db || !deviceId || !navigator.onLine) return null;

  const ctx = getActivityContext();
  const uid = auth?.currentUser?.uid || userData?.uid || userData?.id || 'unknown';
  const payload = {
    id: deviceId,
    billerCode: billerCode || userData?.billerCode || '',
    operatorName: userData?.name || userData?.displayName || '',
    branchCode: userData?.branchName || userData?.storeName || userData?.primaryStore || 'default',
    clientOS: ctx.deviceInfo || ctx.userAgent?.slice(0, 80) || '',
    deviceName: ctx.deviceName || ctx.deviceInfo || '',
    deviceOS: ctx.deviceOS || '',
    deviceBrowser: ctx.deviceBrowser || '',
    platform: ctx.platform || '',
    geo: ctx.geo || '',
    timezone: ctx.timezone || '',
    userId: uid,
    storeId: userData?.primaryStore || userData?.storeId || 'default',
    isOnline: true,
    isLocked: false,
    lastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'devices', deviceId), payload, { merge: true });
    return payload;
  } catch (err) {
    console.warn('[deviceRegistry] sync failed:', err?.message);
    return null;
  }
};

/** Heartbeat — keeps device online status fresh while app is open */
export const heartbeatSessionDevice = async (deviceId) => {
  if (!isFirebaseReady() || !db || !deviceId || !navigator.onLine) return;
  try {
    await setDoc(doc(db, 'devices', deviceId), {
      isOnline: true,
      lastActiveAt: serverTimestamp(),
    }, { merge: true });
  } catch { /* ignore */ }
};

const LOCAL_DEVICES_KEY = 'aone_devices_registry';

/** Persist device locally (offline) — merged into /admin/devices + audit filter */
export const registerLocalDevice = (userData, deviceId, billerCode) => {
  if (!deviceId) return;
  const ctx = getActivityContext();
  const entry = {
    id: deviceId,
    billerCode: billerCode || userData?.billerCode || '',
    operatorName: userData?.name || userData?.displayName || '',
    branchCode: userData?.branchName || userData?.storeName || userData?.primaryStore || 'default',
    clientOS: ctx.deviceInfo || '',
    deviceName: ctx.deviceName || ctx.deviceInfo || '',
    deviceOS: ctx.deviceOS || '',
    deviceBrowser: ctx.deviceBrowser || '',
    platform: ctx.platform || '',
    geo: ctx.geo || '',
    timezone: ctx.timezone || '',
    userId: auth?.currentUser?.uid || userData?.uid || userData?.id || '',
    storeId: userData?.primaryStore || userData?.storeId || 'default',
    isOnline: ctx.online,
    isLocked: false,
    lastActiveAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: ctx.online ? 'online' : 'offline',
  };
  try {
    const raw = localStorage.getItem(LOCAL_DEVICES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((d) => d.id === deviceId);
    if (idx >= 0) list[idx] = { ...list[idx], ...entry };
    else list.unshift(entry);
    localStorage.setItem(LOCAL_DEVICES_KEY, JSON.stringify(list.slice(0, 100)));
  } catch { /* ignore */ }
  try {
    localStorage.setItem('aone_device_name', entry.deviceName || entry.clientOS || '');
  } catch { /* ignore */ }
};

export const getLocalDevices = () => {
  try {
    const raw = localStorage.getItem(LOCAL_DEVICES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const getLocalDevicesMap = () => {
  const map = {};
  getLocalDevices().forEach((d) => {
    if (d?.id) map[d.id] = d;
  });
  return map;
};

/** Merge Firestore + local device maps (local wins on same id for freshest geo/status) */
export const mergeDeviceMaps = (firestoreMap = {}, localMap = {}) => ({
  ...firestoreMap,
  ...localMap,
});

export default {
  getDeviceLabel,
  resolveLogDeviceLabel,
  mergeDeviceFilterOptions,
  isDeviceOnline,
  syncSessionDeviceToFirestore,
  heartbeatSessionDevice,
  registerLocalDevice,
  getLocalDevices,
  getLocalDevicesMap,
  mergeDeviceMaps,
  DEVICE_ONLINE_WINDOW_MS,
};
