/**
 * A One POS — Shop LAN Server
 * Shared offline database for biller + cashier on multiple PCs (same branch).
 * No internet required on shop floor — only LAN between PCs.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'shop-db.json');
const PORT = Number(process.env.SHOP_PORT || 3001);
const HOST = process.env.SHOP_HOST || '0.0.0.0';

const emptyDb = () => ({ serialCounters: {}, orders: [], payments: [] });

const readDb = () => {
  try {
    if (!fs.existsSync(DB_FILE)) return emptyDb();
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return emptyDb();
  }
};

let _db = readDb();
let _writeQueue = Promise.resolve();

const persist = () => {
  _writeQueue = _writeQueue.then(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2), 'utf8');
  });
  return _writeQueue;
};

const norm = (s) => String(s || '').trim().toUpperCase();
const serialTail = (s) => {
  const n = norm(s);
  const parts = n.split('-');
  return parts[parts.length - 1] || n;
};

const serialMatches = (input, full) => {
  const q = norm(input);
  const f = norm(full);
  if (!q || !f) return false;
  if (f === q) return true;
  if (f.endsWith(q)) return true;
  if (serialTail(f) === q) return true;
  if (q.length >= 3 && f.includes(q)) return true;
  return false;
};

const isPendingOrder = (o) => {
  if (!o || o.isDeleted) return false;
  const ps = norm(o.paymentStatus);
  const st = norm(o.status);
  if (ps === 'PAID' || ps === 'CASHIER_PAID') return false;
  if (st === 'PAID' || st === 'CASHIER_PAID' || st === 'CANCELLED') return false;
  if (ps === 'PENDING_PAYMENT' || ps === 'PENDING_APPROVAL') return true;
  if (st === 'APPROVED' || st === 'PENDING') return true;
  if (o.isActiveOrder === true) return true;
  return o.cashierHandover !== false;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'aone-shop-server',
    orders: _db.orders.length,
    pending: _db.orders.filter(isPendingOrder).length,
    time: new Date().toISOString(),
  });
});

/** Central serial counter per store (multi-biller offline safe) */
app.post('/api/serial/claim', async (req, res) => {
  const { storeId, storeCode } = req.body || {};
  if (!storeId || !storeCode) {
    return res.status(400).json({ error: 'storeId and storeCode required' });
  }
  const key = String(storeId);
  const prev = Number(_db.serialCounters[key] || 0);
  const next = prev + 1;
  _db.serialCounters[key] = next;
  await persist();

  const dd = String(new Date().getDate()).padStart(2, '0');
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');
  const yy = String(new Date().getFullYear()).slice(-2);
  const serial = `${String(storeCode).toUpperCase()}-BIL-${dd}${mm}${yy}-${String(next).padStart(6, '0')}`;

  res.json({ serial, counter: next, storeId: key });
});

app.get('/api/orders/pending', (req, res) => {
  const storeId = req.query.storeId;
  let list = _db.orders.filter(isPendingOrder);
  if (storeId) list = list.filter((o) => o.storeId === storeId);
  list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  res.json({ orders: list });
});

app.get('/api/orders/by-serial/:serial', (req, res) => {
  const storeId = req.query.storeId;
  const serial = req.params.serial;
  const hits = _db.orders.filter((o) => {
    if (storeId && o.storeId && o.storeId !== storeId) return false;
    return serialMatches(serial, o.billSerial || o.serialNo);
  });
  if (!hits.length) return res.status(404).json({ error: 'not_found' });
  const pending = hits.find(isPendingOrder) || hits[0];
  res.json({ order: pending });
});

app.post('/api/orders', async (req, res) => {
  const body = req.body || {};
  const localId = body.localId || body.id || `shop_${randomUUID()}`;
  const billSerial = body.billSerial || body.serialNo;
  if (!billSerial) return res.status(400).json({ error: 'billSerial required' });

  const dupe = _db.orders.find(
    (o) => norm(o.billSerial || o.serialNo) === norm(billSerial) && o.storeId === body.storeId,
  );
  if (dupe && isPendingOrder(dupe)) {
    return res.json({ success: true, id: dupe.id, localId: dupe.localId, duplicate: true, order: dupe });
  }

  const order = {
    ...body,
    id: localId,
    localId,
    billSerial,
    serialNo: billSerial,
    savedAt: body.savedAt || new Date().toISOString(),
    status: body.status || 'pending',
    paymentStatus: body.paymentStatus || 'pending_payment',
    isActiveOrder: body.isActiveOrder !== false,
    isDeleted: false,
    syncStatus: 'pending',
    source: 'shop-server',
  };

  const idx = _db.orders.findIndex((o) => o.localId === localId || o.id === localId);
  if (idx >= 0) _db.orders[idx] = { ..._db.orders[idx], ...order };
  else _db.orders.push(order);

  await persist();
  res.json({ success: true, id: localId, localId, order });
});

app.post('/api/orders/:id/pay', async (req, res) => {
  const id = req.params.id;
  const {
    amount, paymentMethod = 'Cash', cashierId = '', cashierName = 'Cashier',
  } = req.body || {};

  let order = _db.orders.find((o) => o.id === id || o.localId === id);
  if (!order && req.body?.billSerial) {
    order = _db.orders.find((o) => serialMatches(req.body.billSerial, o.billSerial || o.serialNo));
  }
  if (!order) return res.status(404).json({ error: 'order_not_found' });

  const ps = norm(order.paymentStatus);
  if (ps === 'CASHIER_PAID' || ps === 'PAID') {
    return res.json({ success: true, alreadyPaid: true, order });
  }

  const paidAmount = Number(amount) || Number(order.totalAmount) || 0;
  Object.assign(order, {
    status: 'cashier_paid',
    paymentStatus: 'cashier_paid',
    paymentType: paymentMethod,
    paidBy: cashierId,
    paidByName: cashierName,
    amountReceived: paidAmount,
    paidAmount,
    paidAt: new Date().toISOString(),
    cashierPaidAt: new Date().toISOString(),
    isActiveOrder: false,
    offlineSyncPending: true,
    updatedAt: new Date().toISOString(),
  });

  _db.payments.push({
    id: `pay_${randomUUID()}`,
    orderId: order.id,
    billSerial: order.billSerial,
    amount: paidAmount,
    paymentMethod,
    cashierId,
    cashierName,
    storeId: order.storeId,
    createdAt: new Date().toISOString(),
  });

  await persist();
  res.json({ success: true, order });
});

app.listen(PORT, HOST, () => {
  console.log(`[shop-server] ✅ http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`[shop-server] LAN: other PCs use http://<THIS-PC-IP>:${PORT}`);
  console.log(`[shop-server] Data: ${DB_FILE}`);
});
