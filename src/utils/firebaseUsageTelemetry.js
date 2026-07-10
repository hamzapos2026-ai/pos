/**
 * Client-side Firebase operation counters (Spark quota assistant).
 * Persists daily buckets in localStorage — complements Console metrics.
 */

const LS_KEY = 'aone_firebase_usage_v1';
const HISTORY_DAYS = 31;

const _todayKey = () => new Date().toISOString().slice(0, 10);

const _load = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { days: {} };
  } catch {
    return { days: {} };
  }
};

const _save = (state) => {
  try {
    const keys = Object.keys(state.days || {}).sort();
    while (keys.length > HISTORY_DAYS) {
      delete state.days[keys.shift()];
    }
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
};

const _ensureDay = (state, dayKey) => {
  if (!state.days[dayKey]) {
    state.days[dayKey] = { reads: 0, writes: 0, deletes: 0, listeners: 0 };
  }
  return state.days[dayKey];
};

export const recordFirebaseOp = (type, count = 1) => {
  const n = Math.max(0, Number(count) || 0);
  if (!n) return;
  const state = _load();
  const bucket = _ensureDay(state, _todayKey());
  if (type === 'read') bucket.reads += n;
  else if (type === 'write') bucket.writes += n;
  else if (type === 'delete') bucket.deletes += n;
  else if (type === 'listener') bucket.listeners += n;
  _save(state);
};

const _sumRange = (state, daysBack) => {
  const totals = { reads: 0, writes: 0, deletes: 0 };
  const now = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const b = state.days[key];
    if (!b) continue;
    totals.reads += b.reads || 0;
    totals.deletes += b.deletes || 0;
    totals.writes += b.writes || 0;
  }
  return totals;
};

export const getUsageStats = () => {
  const state = _load();
  const todayKey = _todayKey();
  const today = state.days[todayKey] || { reads: 0, writes: 0, deletes: 0 };
  return {
    today,
    week: _sumRange(state, 7),
    month: _sumRange(state, 30),
    history: Object.entries(state.days || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, v]) => ({ date, reads: v.reads || 0, writes: v.writes || 0 })),
    topSources: today.sources || {},
  };
};

/** Rough guide for Super Admin — where reads likely went today. */
export const getEstimatedReadBreakdown = () => {
  const tips = [
    { key: 'admin_bills', label: 'Admin/Manager Bills page', hint: 'Hybrid listener ~400 docs per open', severity: 'high' },
    { key: 'cashier_queue', label: 'Cashier pending listener', hint: '~150 docs per cashier PC', severity: 'high' },
    { key: 'activity_logs', label: 'Activity / Audit logs', hint: 'Was 2,500+ per full scan — now capped at 400', severity: 'medium' },
    { key: 'paid_index', label: 'Cashier paid-index reconcile', hint: 'After payment or tab focus', severity: 'medium' },
    { key: 'backup', label: 'Backup buttons (Assistant)', hint: 'Now max ~400 docs per collection, not full DB', severity: 'low' },
    { key: 'health_scan', label: 'Firebase Assistant scan', hint: 'Only ~6 reads — cached 10 min', severity: 'low' },
  ];
  return tips;
};

export default { recordFirebaseOp, getUsageStats, getEstimatedReadBreakdown };
