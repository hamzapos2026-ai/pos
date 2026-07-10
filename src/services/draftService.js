// File: src/services/draftService.js
// Purpose: Multi-tab Draft + Recovery System using Dexie

import { db, initDatabase, ensureDbReady } from '../db/index';

export const getDraftKey = (storeId, userId, tabId) =>
  `draft_${storeId || 'default'}_${userId || 'anon'}_${tabId}`;

const isDbError = (err) =>
  err && (
    err.name === 'DatabaseClosedError'
    || err.name === 'UpgradeError'
    || String(err).includes('VersionError')
    || /changing primary key/i.test(err?.message || '')
  );

export const saveDraftLocal = async (storeId, userId, tabId, draftData) => {
  try {
    await ensureDbReady();
    const key = getDraftKey(storeId, userId, tabId);
    await db.drafts.put({
      key,
      storeId: storeId || 'default',
      userId: userId || 'anon',
      tabId,
      data: JSON.stringify(draftData),
      version: 7,
      timestamp: Date.now(),
    });
    return true;
  } catch (err) {
    console.error('[draftService] Failed to save draft:', err?.name, err?.message);
    return false;
  }
};

export const loadDraftLocal = async (storeId, userId, tabId) => {
  const key = getDraftKey(storeId, userId, tabId);
  try {
    await ensureDbReady();
    const draft = await db.drafts.get(key);
    if (draft?.data) return JSON.parse(draft.data);
    return null;
  } catch (err) {
    console.error('[draftService] Failed to load draft:', err?.name, err?.message);
    if (isDbError(err)) {
      try {
        await initDatabase();
        const draft = await db.drafts.get(key);
        if (draft?.data) return JSON.parse(draft.data);
      } catch (retryErr) {
        console.error('[draftService] retry failed:', retryErr?.name, retryErr?.message);
      }
    }
    return null;
  }
};

export const loadAllUserDrafts = async (storeId, userId) => {
  const sid = storeId || 'default';
  const uid = userId || 'anon';
  try {
    await ensureDbReady();
    const drafts = await db.drafts
      .where('storeId').equals(sid)
      .and((d) => d.userId === uid)
      .toArray();
    return drafts.map((d) => ({
      tabId: d.tabId,
      data: JSON.parse(d.data),
      timestamp: d.timestamp,
    })).sort((a, b) => a.tabId - b.tabId);
  } catch (err) {
    console.error('[draftService] Failed to load all drafts:', err?.name, err?.message);
    if (isDbError(err)) {
      try {
        await initDatabase();
        const drafts = await db.drafts
          .where('storeId').equals(sid)
          .and((d) => d.userId === uid)
          .toArray();
        return drafts.map((d) => ({
          tabId: d.tabId,
          data: JSON.parse(d.data),
          timestamp: d.timestamp,
        })).sort((a, b) => a.tabId - b.tabId);
      } catch (retryErr) {
        console.error('[draftService] retry failed:', retryErr?.name, retryErr?.message);
      }
    }
    return [];
  }
};

export const clearDraftLocal = async (storeId, userId, tabId) => {
  const key = getDraftKey(storeId, userId, tabId);
  try {
    await ensureDbReady();
    await db.drafts.delete(key);
    return true;
  } catch (err) {
    console.error('[draftService] Failed to clear draft:', err?.name, err?.message);
    if (isDbError(err)) {
      try {
        await initDatabase();
        await db.drafts.delete(key);
        return true;
      } catch (retryErr) {
        console.error('[draftService] retry failed:', retryErr?.name, retryErr?.message);
      }
    }
    return false;
  }
};

export const clearAllUserDrafts = async (storeId, userId) => {
  const sid = storeId || 'default';
  const uid = userId || 'anon';
  try {
    await ensureDbReady();
    const drafts = await db.drafts
      .where('storeId').equals(sid)
      .and((d) => d.userId === uid)
      .toArray();
    const keys = drafts.map((d) => d.key);
    if (keys.length > 0) await db.drafts.bulkDelete(keys);
    return true;
  } catch (err) {
    console.error('[draftService] Failed to clear all drafts:', err?.name, err?.message);
    if (isDbError(err)) {
      try {
        await initDatabase();
        const drafts = await db.drafts.where('storeId').equals(sid).and((d) => d.userId === uid).toArray();
        const keys = drafts.map((d) => d.key);
        if (keys.length) await db.drafts.bulkDelete(keys);
        return true;
      } catch (retryErr) {
        console.error('[draftService] retry failed:', retryErr?.name, retryErr?.message);
      }
    }
    return false;
  }
};

export default {
  saveDraftLocal,
  loadDraftLocal,
  loadAllUserDrafts,
  clearDraftLocal,
  clearAllUserDrafts,
};
