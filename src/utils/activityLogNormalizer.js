// Normalizes activity records from Firestore collections + Dexie offline queue

const parseTimestamp = (ts) => {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toActivityLogISO = (ts) => {
  const d = parseTimestamp(ts);
  return d ? d.toISOString() : new Date(0).toISOString();
};

export const normalizeManagerActivityLog = (doc, source) => {
  const d = doc || {};
  const id = d._id || d.id || `${source}_${Math.random().toString(36).slice(2, 9)}`;

  const base = {
    logId: String(id),
    _source: source,
    details: {},
  };

  const pickDetails = (fields) => {
    const out = {};
    fields.forEach((k) => {
      if (d[k] !== undefined && d[k] !== null && d[k] !== '') out[k] = d[k];
    });
    return out;
  };

  switch (source) {
    case 'cashierActions':
      return {
        ...base,
        action: d.type || d.actionType || d.action || 'CASHIER_ACTION',
        timestamp: toActivityLogISO(d.performedAt || d.timestamp || d.createdAt),
        userId: d.cashierId || d.userId || '',
        userName: d.cashierName || d.userName || '',
        storeId: d.storeId || '',
        details: pickDetails([
          'billSerial', 'serialNo', 'amount', 'totalAmount', 'paymentMethod',
          'paymentType', 'billerName', 'billerId', 'itemsCount', 'reason',
        ]),
      };

    case 'clearedData':
      return {
        ...base,
        action: d.type || d.reason || 'item_cleared',
        timestamp: toActivityLogISO(d.deletedAt || d.timestamp),
        userId: d.billerId || d.userId || '',
        userName: d.billerName || d.userName || '',
        storeId: d.storeId || '',
        details: pickDetails(['serialNo', 'reason', 'itemsCount', 'date']),
      };

    case 'deletedBills':
      return {
        ...base,
        action: 'BILL_DELETED',
        timestamp: toActivityLogISO(d.cancelledAt || d.timestamp),
        userId: d.orderSnapshot?.billerId || d.userId || '',
        userName: d.orderSnapshot?.billerName || d.userName || '',
        storeId: d.storeId || d.orderSnapshot?.storeId || '',
        details: pickDetails(['billSerial', 'serialNo', 'reason', 'originalOrderId']),
      };

    case 'auditLogs':
      return {
        ...base,
        action: d.action || 'UNKNOWN',
        timestamp: toActivityLogISO(d.timestamp || d._serverCreatedAt || d._createdAt),
        userId: d.cashierId || d.userId || '',
        userName: d.cashierName || d.userName || '',
        storeId: d.storeId || '',
        details: pickDetails([
          'billSerial', 'serialNo', 'amount', 'paymentType', 'deviceId', 'billId',
        ]),
      };

    case 'offline':
      return {
        ...base,
        logId: `offline_${d.id ?? id}`,
        action: d.action || 'UNKNOWN',
        timestamp: toActivityLogISO(d.timestamp || d._createdAt),
        userId: d.userId || '',
        userName: d.userName || d.userId || '',
        storeId: d.storeId || '',
        details: pickDetails(['billSerial', 'serialNo', 'amount', 'note']),
      };

    case 'activityLogs':
    default: {
      const { action, userId, userName, storeId, timestamp, _createdAt, _serverCreatedAt, id: _omit, ...rest } = d;
      return {
        ...base,
        action: action || 'UNKNOWN',
        timestamp: toActivityLogISO(timestamp || _serverCreatedAt || _createdAt),
        userId: userId || d.cashierId || '',
        userName: userName || d.cashierName || '',
        storeId: storeId || '',
        details: rest,
      };
    }
  }
};

export const MANAGER_ACTIVITY_SOURCES = [
  { key: 'activityLogs', collection: 'activityLogs', orderField: 'timestamp' },
  { key: 'cashierActions', collection: 'cashierActions', orderField: 'timestamp' },
  { key: 'auditLogs', collection: 'auditLogs', orderField: 'timestamp' },
  { key: 'clearedData', collection: 'clearedData', orderField: 'deletedAt' },
  { key: 'deletedBills', collection: 'deletedBills', orderField: 'cancelledAt' },
];

/** Prefer canonical source when the same event exists in multiple collections */
const DEDUPE_SOURCE_PRIORITY = {
  activityLogs: 1,
  auditLogs: 2,
  cashierActions: 3,
  deletedBills: 4,
  clearedData: 5,
  offline: 6,
};

const dedupeTimestamp = (ts) => {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Collapse duplicate rows (same action + bill + user + time window across sources) */
export const dedupeActivityLogs = (logs) => {
  if (!Array.isArray(logs) || !logs.length) return [];

  const buildKey = (log) => {
    const ts = dedupeTimestamp(log.timestamp);
    const bucket = ts ? Math.floor(ts.getTime() / 120000) : 0;
    const action = String(log.action || '').toUpperCase().replace(/\s+/g, '_');
    const serial = String(log.billSerial || log.billId || '').trim();
    const user = String(log.userId || log.userName || '').trim();
    const amt = Number(log.amount || 0);
    return `${action}|${serial}|${user}|${bucket}|${amt}`;
  };

  const map = new Map();
  for (const log of logs) {
    const key = buildKey(log);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, log);
      continue;
    }
    const pNew = DEDUPE_SOURCE_PRIORITY[log._source] ?? 50;
    const pOld = DEDUPE_SOURCE_PRIORITY[prev._source] ?? 50;
    if (pNew < pOld) map.set(key, log);
    else if (pNew === pOld && log.synced !== false && prev.synced === false) map.set(key, log);
  }

  return [...map.values()].sort((a, b) => {
    const ta = dedupeTimestamp(a.timestamp)?.getTime() || 0;
    const tb = dedupeTimestamp(b.timestamp)?.getTime() || 0;
    return tb - ta;
  });
};

/** Branch filter — strict: managers only see logs tagged with their branch */
export const activityLogMatchesBranch = (log, branchIds) => {
  if (!branchIds?.length) return true;
  const sid = String(log?.storeId || '').trim();
  if (!sid || sid === 'default') return false;
  return branchIds.includes(sid);
};
