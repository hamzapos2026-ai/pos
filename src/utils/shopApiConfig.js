/** Shop LAN API — shared offline DB for multi-PC same branch */

const LS_KEY = 'aone_shop_api_url';
let _reachable = null;
let _checkedAt = 0;
const CACHE_MS = 8000;

export const getShopApiBase = () => {
  const env = String(import.meta.env.VITE_SHOP_API_URL || '').trim();
  if (env) return env.replace(/\/$/, '');
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls) return String(ls).trim().replace(/\/$/, '');
  } catch { /* ignore */ }
  return '';
};

export const setShopApiBase = (url) => {
  try {
    if (!url) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, String(url).trim().replace(/\/$/, ''));
    _reachable = null;
  } catch { /* ignore */ }
};

export const isShopApiConfigured = () => Boolean(getShopApiBase());

export const isShopApiReachable = async (force = false) => {
  const base = getShopApiBase();
  if (!base) return false;
  const now = Date.now();
  if (!force && _reachable !== null && now - _checkedAt < CACHE_MS) return _reachable;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    _reachable = res.ok;
  } catch {
    _reachable = false;
  }
  _checkedAt = now;
  return _reachable;
};

export const clearShopApiReachabilityCache = () => {
  _reachable = null;
  _checkedAt = 0;
};
