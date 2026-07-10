/**
 * Dashboard stats — summary docs first, minimal collection reads.
 */

import { collection, getDocs, query, orderBy, limit, getCountFromServer } from './firebase';
import { db, isFirebaseReady } from './firebase';
import { fetchGlobalDailySummary, pkDateKey } from './dailySummaryService';
import { DASHBOARD_SUMMARY_FALLBACK_ORDER_LIMIT } from '../utils/firebaseQuotaConfig';
import { getHasInternet } from '../utils/networkReachability';

export const fetchDashboardStats = async () => {
  if (!isFirebaseReady() || !db || !getHasInternet()) {
    return null;
  }

  let users = 0;
  let stores = 0;
  let totalBills = 0;
  let todaySales = 0;
  let pendingReceivables = 0;
  let cashInHand = 0;
  let expenses = 0;
  let returns = 0;

  const safeCount = async (collName) => {
    try {
      const countSnap = await getCountFromServer(query(collection(db, collName)));
      return countSnap.data().count;
    } catch {
      try {
        const docs = await getDocs(collection(db, collName));
        return docs.size;
      } catch {
        return 0;
      }
    }
  };

  const [userCount, storeCount, orderCount, globalSummary] = await Promise.all([
    safeCount('users'),
    safeCount('stores'),
    safeCount('orders'),
    fetchGlobalDailySummary(pkDateKey()).catch(() => null),
  ]);

  users = userCount;
  stores = storeCount;
  totalBills = orderCount;

  const useSummary = Boolean(globalSummary);

  if (useSummary) {
    todaySales = globalSummary.totalSales;
    pendingReceivables = globalSummary.pendingReceivables;
    cashInHand = globalSummary.cashTotal;
    expenses = globalSummary.expenses;
    returns = globalSummary.returns;
  } else {
    try {
      const b = await getDocs(query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(DASHBOARD_SUMMARY_FALLBACK_ORDER_LIMIT),
      ));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      b.docs.forEach((docSnap) => {
        const bill = docSnap.data();
        if (bill.deleted) return;
        const billDate = bill.createdAt?.toDate
          ? bill.createdAt.toDate()
          : new Date(bill.createdAt?.seconds ? bill.createdAt.seconds * 1000 : bill.createdAt || 0);
        const total = Number(bill.totalAmount || bill.grandTotal || bill.total || 0);
        if (billDate >= today) todaySales += total;
        if (bill.status === 'pending' || bill.paymentStatus === 'unpaid') {
          pendingReceivables += Number(bill.balanceDue || total || 0);
        }
        if ((bill.paymentMethod || bill.paymentType || '').toLowerCase() === 'cash') {
          cashInHand += total;
        }
        expenses += Number(bill.expense || 0);
        if (bill.returnAmount) returns += Number(bill.returnAmount);
        else if (bill.status === 'returned' || bill.paymentStatus === 'refund') returns += total;
      });
    } catch { /* ignore */ }
  }

  return {
    users,
    stores,
    totalBills,
    todaySales,
    pendingReceivables,
    cashInHand,
    expenses,
    returns,
    usedSummary: useSummary,
  };
};

export const fetchRecentCashierActions = async (cap = 5) => {
  if (!isFirebaseReady() || !db || !getHasInternet()) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'cashierActions'),
      orderBy('timestamp', 'desc'),
      limit(cap),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

export default { fetchDashboardStats, fetchRecentCashierActions };
