// ✨ NEW: src/hooks/useCashierBills.js
// 🔧 DEBUG VERSION - Heavy logging
// 🔧 Will show in browser console exactly what's happening

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs,
} from '../services/firebase';
import { db as firebaseDb, isFirebaseReady } from '../services/firebase';
import { db as dexieDb } from '../db/index';
import toast from 'react-hot-toast';

export const useCashierBills = (storeId) => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Subscribe to Firebase realtime ────────────────────────
  const subscribe = useCallback(async () => {
    console.log('═══════════════════════════════════════════');
    console.log('[useCashierBills] 🔍 SUBSCRIBE CALLED');
    console.log('[useCashierBills] 📍 storeId:', storeId);
    console.log('[useCashierBills] 🔥 Firebase ready:', isFirebaseReady());
    console.log('═══════════════════════════════════════════');
    
    if (!storeId) {
      console.warn('[useCashierBills] ❌ No storeId — aborting');
      setLoading(false);
      return;
    }
    
    if (!isFirebaseReady()) {
      console.warn('[useCashierBills] ⚠️ Firebase not ready, using Dexie');
      loadFromDexie();
      return;
    }

    setLoading(true);
    setError(null);

    if (unsubRef.current) {
      try { unsubRef.current(); } catch {}
      unsubRef.current = null;
    }

    // 🔍 DEBUG: First, try a one-time getDocs to see what's there
    try {
      console.log('[useCashierBills] 🔍 Running test query...');
      const testQ = query(
        collection(firebaseDb, 'orders'),
        where('storeId', '==', storeId)
      );
      const testSnap = await getDocs(testQ);
      console.log(`[useCashierBills] ✅ Test query result: ${testSnap.size} docs found`);
      
      if (testSnap.size > 0) {
        console.log('[useCashierBills] 📋 Sample bills:');
        testSnap.docs.slice(0, 5).forEach((d, i) => {
          const data = d.data();
          console.log(`  ${i+1}. ${data.billSerial || data.serialNo} | status: ${data.status} | isDeleted: ${data.isDeleted} | storeId: ${data.storeId}`);
        });
      } else {
        console.warn('[useCashierBills] ⚠️ NO BILLS FOUND for storeId:', storeId);
        console.log('[useCashierBills] 💡 Try checking if storeId matches Firebase data');
      }
    } catch (testErr) {
      console.error('[useCashierBills] ❌ Test query failed:', testErr.code, testErr.message);
    }

    try {
      const q = query(
        collection(firebaseDb, 'orders'),
        where('storeId', '==', storeId),
        orderBy('createdAt', 'desc'),
        limit(300),
      );

      console.log('[useCashierBills] 🔄 Setting up onSnapshot listener...');

      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!mountedRef.current) return;
          
          console.log(`[useCashierBills] 📦 SNAPSHOT: ${snap.size} docs received`);
          
          const allDocs = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              status: data.status || 'pending',
              total: data.grandTotal || data.totalAmount || data.total || 0,
            };
          });
          
          console.log('[useCashierBills] 📊 All docs status breakdown:');
          console.log('  - Total:', allDocs.length);
          console.log('  - Pending:', allDocs.filter(b => b.status === 'pending').length);
          console.log('  - Paid:', allDocs.filter(b => b.status === 'paid').length);
          console.log('  - Cancelled:', allDocs.filter(b => b.status === 'cancelled').length);
          console.log('  - isDeleted true:', allDocs.filter(b => b.isDeleted === true).length);
          console.log('  - isDeleted false/undefined:', allDocs.filter(b => b.isDeleted !== true).length);
          
          const filtered = allDocs.filter(d => d.isDeleted !== true);
          
          console.log(`[useCashierBills] ✅ FINAL BILLS: ${filtered.length}`);
          
          if (filtered.length > 0) {
            console.log('[useCashierBills] First 3 bills:');
            filtered.slice(0, 3).forEach((b, i) => {
              console.log(`  ${i+1}.`, {
                serial: b.billSerial || b.serialNo,
                status: b.status,
                total: b.total,
                customer: b.customer?.name || b.customerName,
              });
            });
          }
          
          setBills(filtered);
          setLoading(false);
          setError(null);
        },
        (err) => {
          if (!mountedRef.current) return;
          console.error('[useCashierBills] ❌ Snapshot error:');
          console.error('  Code:', err.code);
          console.error('  Message:', err.message);
          console.error('  Full error:', err);
          
          loadFromDexie();
          setError(err.message);
        },
      );

      unsubRef.current = unsub;
      console.log('[useCashierBills] ✅ Listener attached successfully');
    } catch (err) {
      console.error('[useCashierBills] ❌ Subscribe error:', err);
      loadFromDexie();
    }
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dexie fallback ─────────────────────────────────────────
  const loadFromDexie = useCallback(async () => {
    try {
      console.log('[useCashierBills] 💾 Loading from Dexie, storeId:', storeId);
      
      const local = await dexieDb.orders
        .where('storeId').equals(storeId || 'default')
        .toArray();
      
      console.log(`[useCashierBills] 💾 Dexie raw: ${local.length} bills`);
      
      const sorted = local
        .filter(o => o.isDeleted !== true)
        .map(o => ({
          ...o,
          status: o.status || 'pending',
          total: o.grandTotal || o.totalAmount || o.total || 0,
        }))
        .sort((a, b) => {
          const tA = new Date(a.savedAt || a.createdAt || 0).getTime();
          const tB = new Date(b.savedAt || b.createdAt || 0).getTime();
          return tB - tA;
        });

      console.log(`[useCashierBills] 💾 Dexie filtered: ${sorted.length} bills`);

      if (mountedRef.current) {
        setBills(sorted);
        setLoading(false);
      }
    } catch (err) {
      console.error('[useCashierBills] Dexie error:', err);
      if (mountedRef.current) {
        setBills([]);
        setLoading(false);
      }
    }
  }, [storeId]);

  // ── Initial subscribe ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    subscribe();
    return () => {
      mountedRef.current = false;
      if (unsubRef.current) {
        try { unsubRef.current(); } catch {}
        unsubRef.current = null;
      }
    };
  }, [subscribe]);

  // ── Manual refresh ─────────────────────────────────────────
  const refresh = useCallback(() => {
    console.log('[useCashierBills] 🔄 Manual refresh triggered');
    subscribe();
    toast.success('Bills refreshed', { duration: 1500 });
  }, [subscribe]);

  // ── Counts ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const all = bills.length;
    const pending = bills.filter(b => b.status === 'pending').length;
    const paid = bills.filter(b => b.status === 'paid').length;
    const cancelled = bills.filter(b => b.status === 'cancelled').length;
    
    console.log('[useCashierBills] 📊 Counts updated:', { all, pending, paid, cancelled });
    
    return { all, pending, paid, cancelled };
  }, [bills]);

  // ── Filter ─────────────────────────────────────────────────
  const filterBills = useCallback((status) => {
    if (!status || status === 'all') return bills;
    return bills.filter(b => b.status === status);
  }, [bills]);

  // ── Search ─────────────────────────────────────────────────
  const searchBills = useCallback((term, statusFilter = 'all') => {
    let result = statusFilter === 'all' ? bills : bills.filter(b => b.status === statusFilter);
    if (!term || !term.trim()) return result;
    const lower = term.toLowerCase().trim();
    return result.filter(b =>
      b.serialNo?.toLowerCase().includes(lower) ||
      b.billSerial?.toLowerCase().includes(lower) ||
      b.billId?.toLowerCase().includes(lower) ||
      b.customerName?.toLowerCase().includes(lower) ||
      b.customerPhone?.includes(lower) ||
      b.customer?.name?.toLowerCase().includes(lower) ||
      b.customer?.phone?.includes(lower)
    );
  }, [bills]);

  return {
    bills,
    loading,
    error,
    refresh,
    counts,
    filterBills,
    searchBills,
  };
};

export default useCashierBills;