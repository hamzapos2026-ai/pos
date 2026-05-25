// src/hooks/useDraft.js
// ✅ FIXED v8
// ✅ FIX-1: Empty catch blocks → named params + comments
// ✅ FIX-2: clearAllDrafts — localStorage key iteration safe
// ✅ FIX-3: hasDraft — Dexie count correct API
// ✅ FIX-4: saveDraft — idle guard uses correct field names
// ✅ FIX-5: restoreDraft — version check before returning
// ✅ FIX-6: Auto-save timer — billData null guard
// ✅ Both named + default export

import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { db } from "../db/index.js";

const DRAFT_VERSION = 7;

const _draftKey = (storeId, userId, tabId) =>
  `bill_draft_v${DRAFT_VERSION}:${storeId || "default"}:${userId || "guest"}:${tabId || "0"}`;

const _lastSavedKey = (key) => `${key}_lastSaved`;

// ── Storage helpers ───────────────────────────────────────────
const _ssGet = (key) => {
  try {
    const r = sessionStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch (_e) { return null; }
};

const _ssSave = (key, data) => {
  try { sessionStorage.setItem(key, JSON.stringify(data)); }
  catch (_e) { /* quota exceeded — non-critical */ }
};

const _ssClear = (key) => {
  try { sessionStorage.removeItem(key); }
  catch (_e) { /* ignore */ }
};

const _lsGet = (key) => {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch (_e) { return null; }
};

const _lsSave = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (_e) { /* quota exceeded — non-critical */ }
};

const _lsClear = (key) => {
  try { localStorage.removeItem(key); }
  catch (_e) { /* ignore */ }
};

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════
export function useDraft(billData = null, tabId = 0) {
  const { userData } = useAuth();
  const { settings } = useSettings();

  const userId = userData?.uid || "guest";
  const storeId =
    userData?.storeId ||
    settings?.store?.id ||
    "default";

  const draftKey = _draftKey(storeId, userId, tabId);
  const timerRef = useRef(null);

  // ──────────────────────────────────────────────────────────
  // SAVE DRAFT
  // ──────────────────────────────────────────────────────────
  // eslint-disable-next-line no-use-before-define
  const clearDraft = useCallback(async () => {
    _ssClear(draftKey);
    _lsClear(draftKey);
    try { sessionStorage.removeItem(_lastSavedKey(draftKey)); }
    catch (_e) { /* ignore */ }
    try { await db.drafts.delete(draftKey); }
    catch (_e) { /* IndexedDB unavailable */ }
  }, [draftKey]);

  const saveDraft = useCallback(
    async (data) => {
      if (!data || typeof data !== "object") return;

      // ✅ FIX-4: correct field names for idle check
      const isIdle =
        data.screenLocked === true &&
        (!data.items || data.items.length === 0) &&
        !data.activeBill;

      if (isIdle) {
        await clearDraft();
        return;
      }

      const payload = {
        v: DRAFT_VERSION,
        tabId,
        storeId,
        userId,
        savedAt: Date.now(),
        ...data,
      };

      _ssSave(draftKey, payload);
      _lsSave(draftKey, payload);

      try {
        sessionStorage.setItem(
          _lastSavedKey(draftKey),
          String(Date.now()),
        );
      } catch (_e) { /* ignore */ }

      try {
        await db.drafts.put({
          key: draftKey,
          data: payload,
          timestamp: Date.now(),
          userId,
          storeId,
          tabId: Number(tabId),
          version: DRAFT_VERSION,
        });
      } catch (err) {
        // ✅ FIX-1: named err param
        console.warn("[useDraft] IndexedDB save failed:", err?.message);
      }
    },
    [draftKey, tabId, storeId, userId, clearDraft],
  );

  // ──────────────────────────────────────────────────────────
  // RESTORE DRAFT
  // ──────────────────────────────────────────────────────────
  const restoreDraft = useCallback(async () => {
    // 1. sessionStorage
    const ssData = _ssGet(draftKey);
    if (ssData?.v === DRAFT_VERSION) return ssData;
    if (ssData) _ssClear(draftKey); // version mismatch

    // 2. localStorage
    const lsData = _lsGet(draftKey);
    if (lsData?.v === DRAFT_VERSION) {
      _ssSave(draftKey, lsData);
      return lsData;
    }
    if (lsData) _lsClear(draftKey);

    // 3. IndexedDB
    try {
      const record = await db.drafts.get(draftKey);
      if (record?.data?.v === DRAFT_VERSION) {
        _ssSave(draftKey, record.data);
        _lsSave(draftKey, record.data);
        return record.data;
      }
      // Version mismatch — delete stale record
      if (record) {
        await db.drafts.delete(draftKey).catch(() => { });
      }
    } catch (err) {
      // ✅ FIX-1: named err param
      console.warn("[useDraft] IndexedDB restore failed:", err?.message);
    }

    return null;
  }, [draftKey]);

  // ──────────────────────────────────────────────────────────
  // CLEAR ALL DRAFTS for user+store
  // ──────────────────────────────────────────────────────────
  const clearAllDrafts = useCallback(async () => {
    const prefix = `bill_draft_v${DRAFT_VERSION}:${storeId}:${userId}:`;

    // ✅ FIX-2: safe key iteration (Array.from avoids live-list mutation)
    try {
      Array.from({ length: sessionStorage.length })
        .map((_, i) => sessionStorage.key(i))
        .filter((k) => k?.startsWith(prefix))
        .forEach((k) => {
          try { sessionStorage.removeItem(k); } catch (_e) { /* ignore */ }
        });
    } catch (_e) { /* sessionStorage unavailable */ }

    try {
      Array.from({ length: localStorage.length })
        .map((_, i) => localStorage.key(i))
        .filter((k) => k?.startsWith(prefix))
        .forEach((k) => {
          try { localStorage.removeItem(k); } catch (_e) { /* ignore */ }
        });
    } catch (_e) { /* localStorage unavailable */ }

    // IndexedDB
    try {
      const all = await db.drafts
        .where("userId").equals(userId)
        .and(
          (d) =>
            d.storeId === storeId &&
            d.version === DRAFT_VERSION,
        )
        .toArray();
      const keys = all.map((d) => d.key);
      if (keys.length) await db.drafts.bulkDelete(keys);
    } catch (_e) { /* IndexedDB unavailable */ }
  }, [storeId, userId]);

  // ──────────────────────────────────────────────────────────
  // GET LAST SAVED
  // ──────────────────────────────────────────────────────────
  const getLastSaved = useCallback(() => {
    try {
      const ts = sessionStorage.getItem(_lastSavedKey(draftKey));
      return ts ? new Date(parseInt(ts, 10)) : null;
    } catch (_e) { return null; }
  }, [draftKey]);

  const getLastSavedText = useCallback(() => {
    const d = getLastSaved();
    if (!d) return null;
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 10) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.floor(diffMin / 60)}h ago`;
  }, [getLastSaved]);

  // ──────────────────────────────────────────────────────────
  // HAS DRAFT
  // ──────────────────────────────────────────────────────────
  const hasDraft = useCallback(async () => {
    const ssData = _ssGet(draftKey);
    if (ssData?.v === DRAFT_VERSION) return true;

    const lsData = _lsGet(draftKey);
    if (lsData?.v === DRAFT_VERSION) return true;

    // ✅ FIX-3: correct Dexie count API
    try {
      const count = await db.drafts
        .where("key").equals(draftKey)
        .count();
      return count > 0;
    } catch (_e) { return false; }
  }, [draftKey]);

  // ──────────────────────────────────────────────────────────
  // AUTO-SAVE on billData change
  // ──────────────────────────────────────────────────────────
  // ✅ FIX-6: null guard before scheduling
  // 🔧 FIX-B-04: Skip save if bill already finalized (prevents duplicate restoration)
  useEffect(() => {
    if (billData === null || billData === undefined) return;

    // If the bill has been paid/submitted/approved → clear any existing draft
    const isFinalized =
      billData?.status === "paid" ||
      billData?.status === "submitted" ||
      billData?.status === "approved" ||
      billData?.saveDone === true;

    if (isFinalized) {
      clearDraft();
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(billData);
    }, 200);

    return () => clearTimeout(timerRef.current);
  }, [billData, saveDraft, clearDraft]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return {
    saveDraft,
    restoreDraft,
    clearDraft,
    clearAllDrafts,
    getLastSaved,
    getLastSavedText,
    hasDraft,
    draftKey,
  };
}

export default useDraft;