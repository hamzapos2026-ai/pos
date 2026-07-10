/**
 * Shop LAN API client — biller + cashier multi-PC offline (same branch)
 */

import { getShopApiBase, isShopApiReachable, clearShopApiReachabilityCache } from '../utils/shopApiConfig';
import { isCashierPendingBill } from '../utils/cashierOrderUtils';

const _fetch = async (path, options = {}) => {
  const base = getShopApiBase();
  if (!base) throw new Error('shop_api_not_configured');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `shop_api_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

export const shopApiHealth = async () => {
  if (!(await isShopApiReachable(true))) return null;
  return _fetch('/health');
};

/** Map shop-server order → cashier list shape */
export const mapShopOrder = (o) => ({
  ...o,
  id: o.id || o.localId,
  localId: o.localId || o.id,
  billSerial: o.billSerial || o.serialNo,
  isLocalOnly: false,
  offlinePending: false,
  fromShopApi: true,
  source: 'shop-api',
});

export const shopApiGetPendingOrders = async (storeId) => {
  if (!(await isShopApiReachable())) return [];
  const q = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const data = await _fetch(`/api/orders/pending${q}`);
  return (data.orders || [])
    .filter(isCashierPendingBill)
    .map(mapShopOrder);
};

export const shopApiFindBySerial = async (storeId, serial) => {
  if (!(await isShopApiReachable())) return null;
  try {
    const q = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
    const data = await _fetch(`/api/orders/by-serial/${encodeURIComponent(serial)}${q}`);
    return data.order ? mapShopOrder(data.order) : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
};

export const shopApiCreateOrder = async (order) => {
  if (!(await isShopApiReachable())) return null;
  const data = await _fetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
  clearShopApiReachabilityCache();
  return data;
};

export const shopApiPayOrder = async ({
  orderId, billSerial, amount, paymentMethod, cashierId, cashierName,
}) => {
  if (!(await isShopApiReachable())) return null;
  const id = orderId || 'by-serial';
  const data = await _fetch(`/api/orders/${encodeURIComponent(id)}/pay`, {
    method: 'POST',
    body: JSON.stringify({ billSerial, amount, paymentMethod, cashierId, cashierName }),
  });
  clearShopApiReachabilityCache();
  return data;
};

export const shopApiClaimSerial = async (storeId, storeCode) => {
  if (!(await isShopApiReachable())) return null;
  const data = await _fetch('/api/serial/claim', {
    method: 'POST',
    body: JSON.stringify({ storeId, storeCode }),
  });
  return data.serial || null;
};

/** Merge shop API orders with local Dexie (shop wins on same serial) */
export const mergeShopWithLocal = (shopOrders, localOrders) => {
  const map = new Map();
  (localOrders || []).forEach((o) => {
    const key = String(o.billSerial || o.serialNo || o.id || '').toUpperCase();
    if (key) map.set(key, o);
  });
  (shopOrders || []).forEach((o) => {
    const key = String(o.billSerial || o.serialNo || o.id || '').toUpperCase();
    if (key) map.set(key, o);
  });
  return [...map.values()];
};

export default {
  shopApiHealth,
  shopApiGetPendingOrders,
  shopApiFindBySerial,
  shopApiCreateOrder,
  shopApiPayOrder,
  shopApiClaimSerial,
  mergeShopWithLocal,
  mapShopOrder,
};
