/** Client-side resolved keys — cloud sync ke baad bhi row wapas na aaye */

const STORAGE_KEY = 'recon_resolved_v1';
const MAX_KEYS = 400;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const write = (map) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota */ }
};

export const getIssueStableKey = (item = {}) => {
  const issueType = item.issueType || 'issue';
  const local = item?.localId || item?.paymentLocalId;
  if (local) return `${issueType}:local:${local}`;
  if (item?.id && !String(item.id).startsWith('local_')) return `${issueType}:doc:${item.id}`;
  const serial = String(item?.billSerial || item?.serialNo || '').trim().toUpperCase();
  const amt = Math.round(Number(item?.paymentAmount ?? item?.enteredAmount ?? item?.amount) || 0);
  if (serial) return `${issueType}:serial:${serial}:${amt}`;
  return `${issueType}:fallback:${item?.queueId || item?.id || 'x'}`;
};

export const markReconciliationResolved = (itemOrKey) => {
  const key = typeof itemOrKey === 'string' ? itemOrKey : getIssueStableKey(itemOrKey);
  if (!key) return;
  const map = read();
  map[key] = Date.now();
  const entries = Object.entries(map)
    .filter(([, ts]) => Date.now() - ts < TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYS);
  write(Object.fromEntries(entries));
};

export const isReconciliationResolved = (item) => {
  const key = getIssueStableKey(item);
  const ts = read()[key];
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) return false;
  return true;
};

export const filterResolvedFromPayload = (payload = {}) => {
  const strip = (list = []) => list.filter((i) => !isReconciliationResolved(i));
  const fraudIssues = strip(payload.fraudIssues);
  const duplicateIssues = strip(payload.duplicateIssues);
  const offlineIssues = strip(payload.offlineIssues);
  const syncFailures = strip(payload.syncFailures);
  const total = fraudIssues.length + duplicateIssues.length + offlineIssues.length + syncFailures.length;
  return {
    ...payload,
    fraudIssues,
    duplicateIssues,
    offlineIssues,
    syncFailures,
    stats: {
      fraud: fraudIssues.length,
      duplicates: duplicateIssues.length,
      offline: offlineIssues.length,
      syncFailed: syncFailures.length,
      total,
    },
  };
};
