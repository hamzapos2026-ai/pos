// Commission Management — offline-first helpers
// Primary: Dexie (localDB) + settings cache
// Secondary: Firebase via SettingsContext / sync queue

import { db as localDB } from '../db/index';
import { getAllSettings, putSetting } from './localDB';
import { enqueue } from './syncService';
import { computeCommission } from '../utils/commission';

export const COMMISSION_SETTINGS_KEY = 'salesperson';
export const COMMISSION_BROADCAST_CHANNEL = 'aone_pos_commission_settings';

const nowISO = () => new Date().toISOString();

/** Broadcast any settings key change to other tabs (permissions, commission, etc.). */
export const broadcastSettingChange = (key, value) => {
  try {
    const ch = new BroadcastChannel(COMMISSION_BROADCAST_CHANNEL);
    ch.postMessage({ key, value, at: Date.now() });
    ch.close();
  } catch { /* unsupported */ }
};

export const broadcastCommissionSettings = (value) =>
  broadcastSettingChange(COMMISSION_SETTINGS_KEY, value);

export const subscribeCommissionSettings = (handler) => {
  try {
    const ch = new BroadcastChannel(COMMISSION_BROADCAST_CHANNEL);
    ch.onmessage = (ev) => {
      if (ev?.data?.key === COMMISSION_SETTINGS_KEY) handler(ev.data.value);
    };
    return () => { try { ch.close(); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
};

/** Load salesperson settings from local cache (works offline). */
export const getCommissionSettings = async () => {
  try {
    const all = await getAllSettings();
    const row = all.find((s) => s.key === COMMISSION_SETTINGS_KEY);
    return row?.value || {};
  } catch {
    return {};
  }
};

/** Persist settings locally first, then queue Firebase sync. */
export const saveCommissionSettings = async (value, { broadcast = true } = {}) => {
  await putSetting(COMMISSION_SETTINGS_KEY, value);
  await enqueue('setting:update', { key: COMMISSION_SETTINGS_KEY, value });
  if (broadcast) broadcastCommissionSettings(value);
  return value;
};

export const isCommissionModuleEnabled = (settings) =>
  settings?.enableCommission !== false && settings?.enabled !== false;

/** Names-only list for biller UI (no rates). */
export const getAgentsForBiller = (settings) => {
  const agents = settings?.agents || [];
  return agents
    .filter((a) => a.isActive !== false)
    .map((a) => ({ id: a.id, name: a.name }));
};

/**
 * Commission = net line total × rate% (or fixed per unit).
 * For bill-level single SP: pass finalTotal as lineTotal.
 */
/** Net line total after discount (final sale amount for one line). */
export const getItemLineNet = (item) => {
  const qty = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || item.salePrice || 0);
  const discount = Number(item.discount || 0);
  const discType = item.discountType || 'amount';

  let net = price * qty;
  if (discType === 'percent') net -= (net * discount) / 100;
  else net -= discount * qty;
  return Math.max(0, net);
};

export const buildAgentMap = (agents = []) => {
  const map = {};
  agents.forEach((a) => {
    if (a?.id) map[a.id] = a;
  });
  return map;
};

/**
 * Resolve commission params from line item + agent registry (old bills may lack fields).
 */
export const resolveItemCommissionParams = (item, agentMap = {}, { preferAgentRegistry = false } = {}) => {
  const agent = agentMap[item.salespersonId];

  const rate = Number(
    (preferAgentRegistry && agent ? agent.commissionRate : null)
    ?? item.commissionPercent
    ?? item.commissionRate
    ?? agent?.commissionRate
    ?? 0,
  );

  return {
    type: 'percent',
    rate,
    pct: rate,
    fixed: 0,
    agent,
  };
};

/** Per-item commission (fixed = Rs × qty; percent = sale × rate ÷ 100). */
export const calcOrderItemCommission = (item, agentMap = {}, opts = {}) => {
  const qty = Math.max(1, Number(item.qty || item.quantity || 1));
  const lineTotal = getItemLineNet(item);
  const { type, rate, pct, fixed } = resolveItemCommissionParams(item, agentMap, opts);
  const rawComm = computeCommission({ type, rate, pct, fixed, lineTotal, qty });
  return { net: lineTotal, rawComm, qty };
};

/** One row per bill — avoids local + Firebase duplicate inflating totals. */
export const getOrderDedupeKey = (o) => {
  if (!o) return '';
  if (o.billId) return `bill:${o.billId}`;
  if (o.billNumber) return `num:${o.billNumber}`;
  if (o.invoiceNo) return `inv:${o.invoiceNo}`;
  if (o.serialNumber) return `ser:${o.serialNumber}`;
  const fid = o.firebaseId || o.id;
  const lid = o.localId;
  if (fid && lid && fid !== lid) return `fid:${fid}`;
  return fid || lid || `t:${o.savedAt || o.createdAt || ''}`;
};

const orderRowScore = (row) => {
  let s = 0;
  if (Array.isArray(row?.items) && row.items.length > 0) s += 2;
  if (row?.firebaseId || row?.id) s += 1;
  return s;
};

const orderRowTime = (row) =>
  new Date(row?.updatedAt?.toDate?.() || row?.updatedAt || row?.savedAt || 0).getTime();

export const dedupeOrdersForCommission = (orders = []) => {
  const map = new Map();
  orders.forEach((o) => {
    const key = getOrderDedupeKey(o);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, o);
      return;
    }
    const tA = orderRowTime(existing);
    const tB = orderRowTime(o);
    if (tB > tA || (tB === tA && orderRowScore(o) >= orderRowScore(existing))) {
      map.set(key, o);
    }
  });
  return [...map.values()];
};

/**
 * Aggregate one order by salesperson — item-level + legacy bill-level fallback.
 */
export const aggregateOrderCommissions = (order, agents = [], opts = {}) => {
  const { preferAgentRegistry = true } = opts;
  const agentMap = buildAgentMap(agents);
  const calcOpts = { preferAgentRegistry };
  const agentIds = agents.map((a) => a.id);
  const result = {};
  agentIds.forEach((id) => {
    result[id] = {
      totalSales: 0,
      commissionGross: 0,
      commissionEarned: 0,
      billsInvolved: new Set(),
      itemCount: 0,
    };
  });

  const billTotal = Number(order.grandTotal || order.totalAmount || order.total || 0);
  const paidAmount = Number(order.paidAmount ?? order.amountReceived ?? billTotal);
  const paidRatio = billTotal > 0 ? Math.min(1, paidAmount / billTotal) : 1;

  const items = Array.isArray(order.items) ? order.items : [];
  let hasItemLevelSp = false;

  items.forEach((item) => {
    const spId = item.salespersonId;
    if (!spId || !result[spId]) return;
    hasItemLevelSp = true;

    const { net, rawComm, qty } = calcOrderItemCommission(item, agentMap, calcOpts);
    result[spId].totalSales += net;
    result[spId].commissionGross += rawComm;
    result[spId].commissionEarned += rawComm * paidRatio;
    result[spId].itemCount += qty;
    result[spId].billsInvolved.add(order.id || order.localId || order.billId);
  });

  const spId = order.salespersonId;
  if (spId && result[spId] && !hasItemLevelSp) {
    const agent = agentMap[spId];
    const type = String(order.salespersonCommissionType || agent?.commissionType || 'percent').toLowerCase();
    const lineTotal = billTotal;
    const qty = 1;
    let stored = Number(order.salespersonCommission || 0);
    if (!stored && agent) {
      const { pct, fixed, rate } = resolveItemCommissionParams(
        {
          commissionType: type,
          commissionPercent: agent.commissionType === 'percent' ? agent.commissionRate : 0,
          commissionFixed: agent.commissionType === 'fixed' ? agent.commissionRate : 0,
          commissionRate: agent.commissionRate,
        },
        agentMap,
      );
      stored = computeCommission({ type, pct, fixed, rate, lineTotal, qty });
    }
    result[spId].totalSales += billTotal;
    result[spId].commissionGross += stored;
    result[spId].commissionEarned += stored * paidRatio;
    result[spId].billsInvolved.add(order.id || order.localId || order.billId);
  }

  return result;
};

export const calculateCommissionAmount = ({
  type = 'percent',
  rate = 0,
  lineTotal = 0,
  qty = 1,
  fixed = 0,
  pct = 0,
}) => computeCommission({ type, rate, pct, fixed, lineTotal, qty });

/** Primary report source: local Dexie orders. */
export const getLocalOrdersForCommission = async () => {
  try {
    const rows = await localDB.orders.toArray();
    const mapped = rows
      .filter((o) => !o.isDeleted && !o.deleted)
      .map((o) => ({
        id: o.firebaseId || o.billId || o.localId,
        ...o,
        items: o.items || [],
        grandTotal: Number(o.grandTotal ?? o.totalAmount ?? o.finalAmount ?? o.total ?? 0),
        paidAmount: Number(o.paidAmount ?? o.amountReceived ?? 0),
        createdAt: o.savedAt || o.createdAt,
      }));
    return dedupeOrdersForCommission(mapped);
  } catch (e) {
    console.warn('[commission] local orders load failed', e);
    return [];
  }
};

/** Record commission ledger row locally + sync queue. */
export const recordCommissionTransaction = async ({
  orderId,
  localOrderId,
  salespersonId,
  salespersonName,
  saleAmount,
  commissionPercent,
  commissionAmount,
  storeId = 'default',
  meta = {},
}) => {
  const row = {
    txId: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orderId: orderId || null,
    localOrderId: localOrderId || null,
    salespersonId,
    salespersonName: salespersonName || '',
    saleAmount: Number(saleAmount) || 0,
    commissionPercent: Number(commissionPercent) || 0,
    commissionAmount: Number(commissionAmount) || 0,
    storeId,
    meta,
    syncStatus: 'pending',
    synced: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  try {
    if (localDB.commission_transactions) {
      await localDB.commission_transactions.add(row);
    }
    await localDB.sync_queue.add({
      queueId: row.txId,
      type: 'commission',
      operation: 'create',
      data: row,
      priority: 2,
      attempts: 0,
      status: 'pending',
      createdAt: nowISO(),
      synced: 0,
    });
  } catch (e) {
    console.warn('[commission] record transaction failed', e);
  }

  return row;
};

/** Date range presets for dashboard filters. */
export const getDateRangePreset = (preset) => {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case 'daily':
      break;
    case 'weekly': {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      break;
    }
    case 'monthly':
      start.setDate(1);
      break;
    default:
      return { from: '', to: '' };
  }

  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
};

export const filterOrdersByDateRange = (orders, dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return orders;
  return orders.filter((o) => {
    const orderDate = new Date(o.createdAt?.toDate?.() || o.createdAt || o.savedAt || 0);
    if (dateFrom && orderDate < new Date(dateFrom)) return false;
    if (dateTo && orderDate > new Date(`${dateTo}T23:59:59`)) return false;
    return true;
  });
};

/**
 * Manager /manager/salespersons list — agents from local settings + order totals + user balances.
 * Works offline; does not require Firebase user accounts for each agent.
 */
export const buildManagerSalespersonList = async () => {
  const spConfig = await getCommissionSettings();
  if (spConfig.enableCommission === false) return [];

  const agents = spConfig.agents || [];
  const agentMap = buildAgentMap(agents);
  const orders = await getLocalOrdersForCommission();
  const map = {};

  agents.forEach((a) => {
    if (a.isActive === false) return;
    map[a.id] = {
      uid: a.id,
      name: a.name,
      displayName: a.name,
      email: a.email || '',
      commissionEarned: 0,
      commissionPending: 0,
      commissionPaid: 0,
      totalSales: 0,
      billsCount: 0,
      isActive: true,
      commissionRate: a.commissionRate,
      commissionType: a.commissionType || 'percent',
      fromSettings: true,
    };
  });

  const billSets = {};
  orders.forEach((order) => {
    const grandTotal = Number(order.grandTotal || order.totalAmount || order.total || 0);
    const paidAmount = Number(order.paidAmount ?? order.amountReceived ?? grandTotal);
    const paidRatio = grandTotal > 0 ? Math.min(1, paidAmount / grandTotal) : 1;

    (order.items || []).forEach((item) => {
      const spId = item.salespersonId;
      if (!spId) return;
      if (!map[spId]) {
        map[spId] = {
          uid: spId,
          name: item.salespersonName || spId,
          displayName: item.salespersonName || spId,
          email: '',
          commissionEarned: 0,
          commissionPending: 0,
          commissionPaid: 0,
          totalSales: 0,
          billsCount: 0,
          isActive: true,
        };
      }
      const { net, rawComm } = calcOrderItemCommission(item, agentMap, { preferAgentRegistry: true });
      map[spId].totalSales += net;
      map[spId].commissionEarned += rawComm * paidRatio;
      map[spId].commissionPending += rawComm * (1 - paidRatio);
      if (!billSets[spId]) billSets[spId] = new Set();
      billSets[spId].add(order.id || order.localId);
    });
  });

  Object.keys(map).forEach((id) => {
    map[id].billsCount = billSets[id]?.size || 0;
  });

  try {
    const users = await localDB.users.toArray();
    users.forEach((u) => {
      const id = u.uid;
      if (!id) return;
      const hasLedger =
        Number(u.commissionEarned || 0) > 0 ||
        Number(u.commissionPending || 0) > 0 ||
        Number(u.commissionPaid || 0) > 0;
      const isSpRole =
        u.role === 'salesperson' || (u.roles || []).includes('salesperson');
      if (!map[id] && !hasLedger && !isSpRole) return;
      if (!map[id]) {
        map[id] = {
          uid: id,
          name: u.name || u.displayName || id,
          displayName: u.displayName || u.name || id,
          email: u.email || '',
          commissionEarned: 0,
          commissionPending: 0,
          commissionPaid: 0,
          totalSales: 0,
          billsCount: 0,
          isActive: u.active !== false,
        };
      }
      const row = map[id];
      if (hasLedger) {
        row.commissionEarned = Number(u.commissionEarned ?? row.commissionEarned);
        row.commissionPending = Number(u.commissionPending ?? row.commissionPending);
        row.commissionPaid = Number(u.commissionPaid ?? row.commissionPaid);
      }
      if (u.name) row.name = u.name;
      if (u.email) row.email = u.email;
    });
  } catch { /* ignore */ }

  return Object.values(map).sort(
    (a, b) => Number(b.commissionPending || 0) - Number(a.commissionPending || 0),
  );
};
