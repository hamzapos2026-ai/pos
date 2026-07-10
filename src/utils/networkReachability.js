/**
 * Real internet reachability — WiFi ON ≠ internet.
 * Used by NetworkContext, counting speech, and cloud sync gates.
 */

const PROBE_URLS = [
  'https://connectivitycheck.gstatic.com/generate_204',
  'https://www.gstatic.com/generate_204',
];

/** False until first successful probe — WiFi ON ≠ internet. */
let _hasInternet = false;
let _probeCompleted = false;
let _lastProbeAt = 0;
const _listeners = new Set();

export const getHasInternet = () => {
  if (typeof navigator === 'undefined') return true;
  if (!navigator.onLine) return false;
  // Optimistic until first probe — avoids cashier/Firebase startup blackout (WiFi OK, probe pending).
  if (!_probeCompleted) return true;
  return _hasInternet;
};

export const subscribeInternet = (fn) => {
  if (typeof fn !== 'function') return () => {};
  _listeners.add(fn);
  try { fn(_hasInternet); } catch { /* ignore */ }
  return () => _listeners.delete(fn);
};

const _emit = (next) => {
  if (_hasInternet === next) return;
  _hasInternet = next;
  _listeners.forEach((fn) => {
    try { fn(next); } catch { /* ignore */ }
  });
};

/** Probe actual WAN — returns false when router has no internet. */
export const probeInternet = async (timeoutMs = 4000) => {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    _probeCompleted = true;
    _emit(false);
    return false;
  }

  for (const url of PROBE_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.type === 'opaque' || res.ok) {
        _lastProbeAt = Date.now();
        _probeCompleted = true;
        _emit(true);
        return true;
      }
    } catch {
      clearTimeout(timer);
    }
  }

  _lastProbeAt = Date.now();
  _probeCompleted = true;
  _emit(false);
  return false;
};

/** Start periodic probe + window online/offline hooks. */
export const startInternetMonitor = ({ intervalMs = 10000 } = {}) => {
  if (typeof window === 'undefined') return () => {};

  const run = async () => {
    if (!navigator.onLine) {
      _emit(false);
      return;
    }
    await probeInternet();
  };

  run();

  const onBrowserOffline = () => {
    _probeCompleted = true;
    _emit(false);
  };
  const onBrowserOnline = () => {
    _probeCompleted = false;
    _emit(false);
    run();
  };

  window.addEventListener('offline', onBrowserOffline);
  window.addEventListener('online', onBrowserOnline);
  const pollId = setInterval(run, intervalMs);

  return () => {
    clearInterval(pollId);
    window.removeEventListener('offline', onBrowserOffline);
    window.removeEventListener('online', onBrowserOnline);
  };
};

export default {
  getHasInternet,
  probeInternet,
  subscribeInternet,
  startInternetMonitor,
};
