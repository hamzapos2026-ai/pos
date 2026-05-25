import { describe, it, expect, beforeEach, vi } from 'vitest';

// We'll create fresh in-memory arrays per test and set up mocks at runtime
let mockOrders;
let mockUsers;
let mockPayments;
let mockCashTx;
let mockLogs;
let mockSyncQueue;

function makeStore(arr, keyName) {
  return {
    add: async (obj) => { arr.push(obj); return arr.length; },
    put: async (obj) => {
      if (!keyName) { arr.push(obj); return; }
      const key = obj[keyName];
      const idx = arr.findIndex(x => x[keyName] === key);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...obj };
      else arr.push(obj);
    },
    toArray: async () => [...arr],
    get: async (key) => arr.find(x => x[keyName] === key) || null,
    where: (prop) => ({
      equals: (val) => ({
        first: async () => arr.find(x => String(x[prop]) === String(val)) || null
      })
    })
  };
}

let managerService;

describe('managerService integration (mocked db)', () => {
  beforeEach(async () => {
    // reset in-memory stores
    mockOrders = [
      { localId: 'order_1', totalAmount: 1000, paidAmount: 200, commissionPercent: 10, salespersonId: 'sp1', shiftId: null, storeId: 'store1', savedAt: new Date().toISOString() }
    ];
    mockUsers = [
      { uid: 'sp1', name: 'Sales Person', commissionEarned: 0, commissionPending: 50, commissionPaid: 0 }
    ];
    mockPayments = [];
    mockCashTx = [];
    mockLogs = [];
    mockSyncQueue = [];

    // runtime mock the db module
    vi.doMock('../src/db/index', () => ({
      db: {
        orders: makeStore(mockOrders, 'localId'),
        users: makeStore(mockUsers, 'uid'),
        payments: makeStore(mockPayments, 'paymentId'),
        cash_transactions: makeStore(mockCashTx, 'txId'),
        logs: makeStore(mockLogs, 'logId'),
        sync_queue: makeStore(mockSyncQueue, 'queueId'),
      }
    }));

    vi.doMock('../src/services/firebase', () => ({
      default: { isFirebaseReady: () => false },
      db: {},
      setDoc: async () => {},
      doc: () => ({}),
      addDoc: async () => {},
      updateDoc: async () => {},
      serverTimestamp: () => '__server_ts__'
    }));

    vi.doMock('../src/services/authService', () => ({
      getCurrentUserData: async () => ({ uid: 'cashier1', displayName: 'Cashier One', primaryStore: 'store1' }),
      canUserAccessBranch: async () => true
    }));

    // Ensure navigator exists in test environment
    global.navigator = { onLine: false };

    // Import managerService after mocks are in place
    const mod = await import('../src/services/managerService');
    managerService = mod.default || mod;
  });

  it('collectPayment records payment, updates order and salesperson commission', async () => {
    const res = await managerService.collectPayment({ localBillId: 'order_1', amount: 300, paymentMethod: 'cash', note: 'test' });
    expect(res.success).toBe(true);
    // payments store should have an entry
    const payments = await (await import('../src/db/index')).db.payments.toArray();
    expect(payments.length).toBe(1);
    expect(payments[0].enteredAmount).toBe(300);

    // order paidAmount should update to 500
    const orders = await (await import('../src/db/index')).db.orders.toArray();
    const order = orders.find(o => o.localId === 'order_1');
    expect(order.paidAmount).toBe(500);

    // logs should include commission_recorded
    const logs = await (await import('../src/db/index')).db.logs.toArray();
    const commLog = logs.find(l => l.action === 'commission_recorded');
    expect(commLog).toBeTruthy();
    expect(commLog.amount).toBeCloseTo(30); // 10% of 300

    // user commissionEarned updated
    const users = await (await import('../src/db/index')).db.users.toArray();
    const sp = users.find(u => u.uid === 'sp1');
    expect(sp.commissionEarned).toBeCloseTo(30);
  });

  it('markCommissionPaid moves pending -> paid and creates cash tx', async () => {
    const dbModule = await import('../src/db/index');
    // set pending to 100
    await dbModule.db.users.put({ uid: 'sp1', commissionPending: 100, commissionPaid: 0 });

    const res = await managerService.markCommissionPaid('sp1', null, 'store1', 'payout test');
    expect(res.success).toBe(true);
    expect(res.amount).toBeGreaterThan(0);

    const users = await dbModule.db.users.toArray();
    const sp = users.find(u => u.uid === 'sp1');
    expect(sp.commissionPending).toBe(0);
    expect(sp.commissionPaid).toBeGreaterThan(0);

    const cash = await dbModule.db.cash_transactions.toArray();
    const tx = cash.find(t => t.reason && t.reason.includes('Commission payout'));
    expect(tx).toBeTruthy();
  });
});
