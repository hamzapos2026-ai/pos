// src/hooks/useNextSerial.js
// ✅ PRODUCTION FINAL - Works with global serial v20

import { useState, useEffect, useRef } from "react";
import {
  subscribeNextSerial,
  syncSerialFromFirebase,
  getCurrentNextSerial,
} from "../services/serialService";

// Track synced sessions (per store+user combo)
const _syncedSessions = new Set();

export const useNextSerial = ({ storeId, user, enabled = true }) => {
  const [state, setState] = useState({
    serial: null,
    counter: null,
    ready: false,
    loading: true,
    storeCode: null,
    pendingOffline: 0,
  });
  
  const mountedRef = useRef(true);
  
  const uid = user?.uid;
  const userKey = uid ? `${storeId}_${uid}` : null;
  
  useEffect(() => {
    mountedRef.current = true;
    
    if (!enabled || !storeId || !uid) {
      setState({
        serial: null,
        counter: null,
        ready: false,
        loading: false,
        storeCode: null,
        pendingOffline: 0,
      });
      return () => { mountedRef.current = false; };
    }
    
    // Subscribe to live updates (instant)
    const unsub = subscribeNextSerial((data) => {
      if (!mountedRef.current) return;
      setState({
        serial: data.serial,
        counter: data.counter,
        ready: data.ready,
        loading: !data.ready,
        storeCode: data.storeCode,
        pendingOffline: data.pendingOffline || 0,
      });
    });
    
    // Sync from Firebase once per session
    if (userKey && !_syncedSessions.has(userKey)) {
      _syncedSessions.add(userKey);
      
      syncSerialFromFirebase(storeId, user)
        .catch((err) => {
          console.warn("[useNextSerial] Sync failed:", err?.message);
          _syncedSessions.delete(userKey); // Allow retry
        });
    }
    
    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [storeId, uid, enabled]);
  
  return state;
};

export default useNextSerial;