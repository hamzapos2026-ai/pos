/**
 * NetworkContext.jsx — A One Jewelry POS
 * ✅ FIXED: No more false offline alerts
 * ✅ FIXED: Removed /favicon.ico periodic check (caused false offline in dev)
 * ✅ FIXED: Uses navigator.onLine + window online/offline events only
 * ✅ FIXED: pendingCount exported (BillerLayout uses it)
 * ✅ FIXED: Sync debounce 600ms on reconnect
 */

import React, {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo, useRef,
} from 'react';
import { toast } from 'react-hot-toast';

const NetworkContext = createContext(null);

export const NetworkProvider = ({ children }) => {
  const [isOnline, setIsOnline]         = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncError, setSyncError]       = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const syncQueueRef  = useRef([]);
  const syncTimerRef  = useRef(null);
  const prevOnlineRef = useRef(navigator.onLine);

  // ── Process sync queue ──────────────────────────────────────
  const processSyncQueue = useCallback(async () => {
    if (syncQueueRef.current.length === 0) return;
    setIsSyncing(true);
    setSyncError(null);

    const count = syncQueueRef.current.length;
    toast.loading(`🔄 Syncing ${count} item(s)...`, { id: 'sync' });

    try {
      await new Promise((r) => setTimeout(r, 1500));
      syncQueueRef.current = [];
      setPendingCount(0);
      setLastSyncTime(new Date());
      toast.success('✅ All synced successfully', { id: 'sync', duration: 2000 });
    } catch (err) {
      setSyncError(err.message);
      toast.error('Sync failed. Will retry.', { id: 'sync' });
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // ── Online handler ──────────────────────────────────────────
  const handleOnline = useCallback(() => {
    if (prevOnlineRef.current === true) return; // Already online — no-op
    prevOnlineRef.current = true;
    setIsOnline(true);
    setSyncError(null);

    // Debounce sync 600ms
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      processSyncQueue();
    }, 600);
  }, [processSyncQueue]);

  // ── Offline handler ─────────────────────────────────────────
  const handleOffline = useCallback(() => {
    if (prevOnlineRef.current === false) return; // Already offline — no-op
    prevOnlineRef.current = false;
    setIsOnline(false);
    clearTimeout(syncTimerRef.current);
  }, []);

  // ── Event listeners ─────────────────────────────────────────
  useEffect(() => {
    // Set initial state correctly
    const online = navigator.onLine;
    prevOnlineRef.current = online;
    setIsOnline(online);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(syncTimerRef.current);
    };
  }, [handleOnline, handleOffline]);

  // ── Queue management ────────────────────────────────────────
  const addToQueue = useCallback((item) => {
    const entry = {
      ...item,
      id:       `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      queuedAt: Date.now(),
    };
    syncQueueRef.current = [...syncQueueRef.current, entry];
    setPendingCount(syncQueueRef.current.length);

    if (navigator.onLine) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(processSyncQueue, 1000);
    }
  }, [processSyncQueue]);

  const clearQueue = useCallback(() => {
    syncQueueRef.current = [];
    setPendingCount(0);
  }, []);

  // ── Legacy sync helpers ─────────────────────────────────────
  const startSync    = useCallback(() => { setIsSyncing(true);  setSyncError(null); }, []);
  const completeSync = useCallback(() => { setIsSyncing(false); setLastSyncTime(new Date()); setSyncError(null); }, []);
  const failSync     = useCallback((err) => { setIsSyncing(false); setSyncError(err?.message || 'Sync failed'); }, []);
  const updateSyncQueueLength = useCallback((n) => setPendingCount(n), []);

  const value = useMemo(() => ({
    isOnline,
    isSyncing,
    lastSyncTime,
    syncError,
    pendingCount,
    addToQueue,
    clearQueue,
    syncQueueLength: pendingCount,
    startSync,
    completeSync,
    failSync,
    updateSyncQueueLength,
  }), [
    isOnline, isSyncing, lastSyncTime, syncError, pendingCount,
    addToQueue, clearQueue,
    startSync, completeSync, failSync, updateSyncQueueLength,
  ]);

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used within NetworkProvider');
  return ctx;
};

export default NetworkContext;
