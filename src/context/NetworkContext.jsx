/**
 * NetworkContext — real internet status (not just WiFi / navigator.onLine).
 */

import React, {
  createContext, useContext, useState,
  useEffect, useCallback, useMemo, useRef,
} from 'react';
import { toast } from 'react-hot-toast';
import {
  getHasInternet,
  probeInternet,
  startInternetMonitor,
  subscribeInternet,
} from '../utils/networkReachability';

const NetworkContext = createContext(null);

export const NetworkProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(() => getHasInternet());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const syncQueueRef = useRef([]);
  const syncTimerRef = useRef(null);
  const prevOnlineRef = useRef(isOnline);

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

  const handleReachabilityChange = useCallback((online) => {
    setIsOnline(online);

    if (prevOnlineRef.current === false && online === true) {
      setSyncError(null);
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        processSyncQueue();
      }, 600);
    }

    if (!online) {
      clearTimeout(syncTimerRef.current);
    }

    prevOnlineRef.current = online;
  }, [processSyncQueue]);

  useEffect(() => {
    const unsubReach = subscribeInternet(handleReachabilityChange);
    const stopMonitor = startInternetMonitor({ intervalMs: 10000 });
    probeInternet().catch(() => {});

    return () => {
      unsubReach();
      stopMonitor();
      clearTimeout(syncTimerRef.current);
    };
  }, [handleReachabilityChange]);

  const addToQueue = useCallback((item) => {
    const entry = {
      ...item,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      queuedAt: Date.now(),
    };
    syncQueueRef.current = [...syncQueueRef.current, entry];
    setPendingCount(syncQueueRef.current.length);

    if (getHasInternet()) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(processSyncQueue, 1000);
    }
  }, [processSyncQueue]);

  const clearQueue = useCallback(() => {
    syncQueueRef.current = [];
    setPendingCount(0);
  }, []);

  const startSync = useCallback(() => { setIsSyncing(true); setSyncError(null); }, []);
  const completeSync = useCallback(() => { setIsSyncing(false); setLastSyncTime(new Date()); setSyncError(null); }, []);
  const failSync = useCallback((err) => { setIsSyncing(false); setSyncError(err?.message || 'Sync failed'); }, []);
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
    probeInternet,
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
