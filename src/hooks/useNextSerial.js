// src/hooks/useNextSerial.js

import { useState, useEffect, useRef, useMemo } from "react";
import {
  bootstrapNextSerial,
  subscribeNextSerial,
  syncSerialFromFirebase,
  refreshOrdersMaxCache,
} from "../services/serialService";
import useStoresMap, { resolveSerialBranchHint } from "./useStoresMap";

export const useNextSerial = ({ storeId, branchId = '', user, enabled = true, storesMap: storesMapProp = null }) => {
  const storesMapInternal = useStoresMap();
  const storesMap = storesMapProp || storesMapInternal;
  const branchHint = useMemo(
    () => resolveSerialBranchHint(branchId || storeId, storesMap, user),
    [branchId, storeId, storesMap, user],
  );
  const [state, setState] = useState(() => ({
    serial: enabled && storeId && user?.uid
      ? bootstrapNextSerial(storeId, user, branchHint)
      : null,
    counter: null,
    ready: Boolean(enabled && storeId && user?.uid),
    loading: false,
    storeCode: null,
    pendingOffline: 0,
  }));

  const mountedRef = useRef(true);

  const uid = user?.uid;

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

    const instant = bootstrapNextSerial(storeId, user, branchHint);
    if (instant) {
      setState((prev) => ({
        ...prev,
        serial: instant,
        ready: true,
        loading: false,
      }));
    }

    const unsub = subscribeNextSerial((data) => {
      if (!mountedRef.current) return;
      setState({
        serial: data.serial,
        counter: data.counter,
        ready: data.ready || Boolean(data.serial),
        loading: !data.serial && !data.ready,
        storeCode: data.storeCode,
        pendingOffline: data.pendingOffline || 0,
      });
    });

    syncSerialFromFirebase(storeId, user, branchHint).catch((err) => {
      console.warn("[useNextSerial] Sync failed:", err?.message);
    });
    refreshOrdersMaxCache(storeId).catch(() => {});

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [storeId, branchHint, uid, enabled, user]);

  return state;
};

export default useNextSerial;
