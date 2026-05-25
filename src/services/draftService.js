// File: src/services/draftService.js
// Purpose: Multi-tab Draft + Recovery System using Dexie
// Requirement: App reload -> draft bill wapas aaye. Multiple bills saved rahein.

import { db, initDatabase } from '../db/index';

/**
 * Generate a unique key for the draft
 */
export const getDraftKey = (storeId, userId, tabId) => {
  return `draft_${storeId || 'default'}_${userId || 'anon'}_${tabId}`;
};

/**
 * Save draft state to Dexie
 */
export const saveDraftLocal = async (storeId, userId, tabId, draftData) => {
  try {
    const key = getDraftKey(storeId, userId, tabId);
    await db.drafts.put({
      key,
      storeId: storeId || 'default',
      userId: userId || 'anon',
      tabId: tabId,
      data: JSON.stringify(draftData),
      version: 7, // Current draft version
      timestamp: Date.now()
    });
    return true;
  } catch (err) {
    console.error('[draftService] Failed to save draft:', err && err.name, err && err.message);
    return false;
  }
};

/**
 * Load a specific draft from Dexie
 */
export const loadDraftLocal = async (storeId, userId, tabId) => {
  try {
    const key = getDraftKey(storeId, userId, tabId);
    const draft = await db.drafts.get(key);
    if (draft && draft.data) {
      return JSON.parse(draft.data);
    }
    return null;
  } catch (err) {
    console.error('[draftService] Failed to load draft:', err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); const draft = await db.drafts.get(key); if (draft && draft.data) return JSON.parse(draft.data); return null; } catch (retryErr) { console.error('[draftService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return null;
  }
};

/**
 * Load all drafts for a user/store (useful for recovering all tabs on reload)
 */
export const loadAllUserDrafts = async (storeId, userId) => {
  try {
    const drafts = await db.drafts
      .where('storeId').equals(storeId || 'default')
      .and(d => d.userId === (userId || 'anon'))
      .toArray();
    
    return drafts.map(d => ({
      tabId: d.tabId,
      data: JSON.parse(d.data),
      timestamp: d.timestamp
    })).sort((a, b) => a.tabId - b.tabId);
  } catch (err) {
    console.error('[draftService] Failed to load all drafts:', err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); const drafts = await db.drafts.where('storeId').equals(storeId || 'default').and(d => d.userId === (userId || 'anon')).toArray(); return drafts.map(d => ({ tabId: d.tabId, data: JSON.parse(d.data), timestamp: d.timestamp })).sort((a,b)=>a.tabId-b.tabId); } catch (retryErr) { console.error('[draftService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return [];
  }
};

/**
 * Clear a specific draft
 */
export const clearDraftLocal = async (storeId, userId, tabId) => {
  try {
    const key = getDraftKey(storeId, userId, tabId);
    await db.drafts.delete(key);
    return true;
  } catch (err) {
    console.error('[draftService] Failed to clear draft:', err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); await db.drafts.delete(key); return true; } catch (retryErr) { console.error('[draftService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return false;
  }
};

/**
 * Clear all drafts for a user
 */
export const clearAllUserDrafts = async (storeId, userId) => {
  try {
    const drafts = await db.drafts
      .where('storeId').equals(storeId || 'default')
      .and(d => d.userId === (userId || 'anon'))
      .toArray();
      
    const keys = drafts.map(d => d.key);
    if (keys.length > 0) {
      await db.drafts.bulkDelete(keys);
    }
    return true;
  } catch (err) {
    console.error('[draftService] Failed to clear all drafts:', err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); const drafts = await db.drafts.where('storeId').equals(storeId || 'default').and(d => d.userId === (userId || 'anon')).toArray(); const keys = drafts.map(d => d.key); if (keys.length) await db.drafts.bulkDelete(keys); return true; } catch (retryErr) { console.error('[draftService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return false;
  }
};

export default {
  saveDraftLocal,
  loadDraftLocal,
  loadAllUserDrafts,
  clearDraftLocal,
  clearAllUserDrafts
};
