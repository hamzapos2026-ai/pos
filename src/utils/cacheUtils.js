// File: src/utils/cacheUtils.js
// Purpose: Cache clearing utilities for A One Jewelry POS
// Features: Clear localStorage, sessionStorage, Dexie DB, service worker cache
// Offline: Yes
// Dependencies: dexie

import { db } from '../db/index';

/**
 * Clear all application caches
 */
export const clearAllCaches = async () => {
  try {
    console.log('[CacheUtils] Starting cache clearing...');

    // 1. Clear localStorage (except critical app settings)
    const keysToKeep = [
      'aone_device_id',
      'aone_sound_enabled_',
      'aone-setup-complete',
      'aone_setup_permanent_lock',
      'aone_setup_date',
      'aone_setup_version',
      'aone_setup_complete_enc',
      'aone_backup_schedule',
    ];

    const localStorageKeys = Object.keys(localStorage);
    for (const key of localStorageKeys) {
      const shouldKeep = keysToKeep.some(keepKey => key.includes(keepKey));
      if (!shouldKeep) {
        localStorage.removeItem(key);
      }
    }

    // 2. Clear sessionStorage
    const sessionStorageKeys = Object.keys(sessionStorage);
    for (const key of sessionStorageKeys) {
      sessionStorage.removeItem(key);
    }

    // 3. Clear Dexie database
    await clearDexieDatabase();

    // 4. Clear service worker cache (if exists)
    await clearServiceWorkerCache();

    // 5. Reset in-memory counters
    resetInMemoryCounters();

    console.log('[CacheUtils] All caches cleared successfully');
    return { success: true };

  } catch (error) {
    console.error('[CacheUtils] Error clearing caches:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear Dexie database
 */
export const clearDexieDatabase = async () => {
  try {
    let setupCacheRow = null;
    try {
      setupCacheRow = await db.settings_cache.get('system_setup_done_enc');
    } catch { /* ignore */ }

    // Clear all tables
    await db.drafts.clear();
    await db.settings_cache.clear();
    await db.held_bills.clear();
    await db.returns.clear();
    await db.shifts.clear();
    await db.cash_transactions.clear();
    await db.activity_logs_local.clear();
    await db.deleted_records.clear();
    await db.sync_queue_local.clear();
    await db.products.clear();
    await db.customer_credits.clear();

    // New tables
    await db.bills.clear();
    await db.bill_items.clear();
    await db.customers.clear();
    await db.payments.clear();
    await db.expenses.clear();
    await db.logs.clear();
    await db.sync_queue.clear();

    // Orders table (legacy + offline bills)
    await db.orders.clear();

    if (setupCacheRow) {
      try { await db.settings_cache.put(setupCacheRow); } catch { /* ignore */ }
    }

    console.log('[CacheUtils] Dexie database cleared');
    return { success: true };

  } catch (error) {
    console.error('[CacheUtils] Error clearing Dexie database:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear service worker cache
 */
export const clearServiceWorkerCache = async () => {
  try {
    if ('serviceWorker' in navigator && 'caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (cacheName.includes('aone') || cacheName.includes('pos')) {
          await caches.delete(cacheName);
        }
      }
      console.log('[CacheUtils] Service worker cache cleared');
    }
  } catch (error) {
    console.warn('[CacheUtils] Error clearing service worker cache:', error);
  }
};

/**
 * Reset in-memory counters
 */
export const resetInMemoryCounters = () => {
  try {
    // Reset item serial counter
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aone_item_serial_counter');
    }

    // Reset any global counters
    if (window.aone_pos_counters) {
      window.aone_pos_counters = {};
    }

    console.log('[CacheUtils] In-memory counters reset');
  } catch (error) {
    console.warn('[CacheUtils] Error resetting counters:', error);
  }
};

/**
 * Clear only draft bills
 */
export const clearDraftBills = async () => {
  try {
    // Clear draft-related localStorage
    const localStorageKeys = Object.keys(localStorage);
    for (const key of localStorageKeys) {
      if (key.includes('bill_draft')) {
        localStorage.removeItem(key);
      }
    }

    // Clear draft-related sessionStorage
    const sessionStorageKeys = Object.keys(sessionStorage);
    for (const key of sessionStorageKeys) {
      if (key.includes('bill_draft')) {
        sessionStorage.removeItem(key);
      }
    }

    // Clear drafts from Dexie
    await db.drafts.clear();

    console.log('[CacheUtils] Draft bills cleared');
    return { success: true };

  } catch (error) {
    console.error('[CacheUtils] Error clearing draft bills:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Clear only serial counters
 */
export const clearSerialCounters = () => {
  try {
    const keysToRemove = [
      'aone_item_serial_counter',
      'pos_serial_max_',
      'pos_serial_used_',
      'pos_serialBroadcast_',
      'pos_offline_serial_',
    ];

    const localStorageKeys = Object.keys(localStorage);
    for (const key of localStorageKeys) {
      const shouldRemove = keysToRemove.some(removeKey => key.includes(removeKey));
      if (shouldRemove) {
        localStorage.removeItem(key);
      }
    }

    console.log('[CacheUtils] Serial counters cleared');
    return { success: true };

  } catch (error) {
    console.error('[CacheUtils] Error clearing serial counters:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async () => {
  try {
    const stats = {
      localStorage: Object.keys(localStorage).length,
      sessionStorage: Object.keys(sessionStorage).length,
      dexieTables: {},
    };

    // Get Dexie table counts
    const tables = [
      'drafts', 'settings_cache', 'held_bills', 'returns', 'shifts',
      'cash_transactions', 'activity_logs_local', 'deleted_records',
      'sync_queue_local', 'products', 'customer_credits',
      'bills', 'bill_items', 'customers', 'payments', 'expenses', 'logs', 'sync_queue'
    ];

    for (const table of tables) {
      try {
        const count = await db[table].count();
        stats.dexieTables[table] = count;
      } catch {
        stats.dexieTables[table] = 0;
      }
    }

    return stats;

  } catch (error) {
    console.error('[CacheUtils] Error getting cache stats:', error);
    return null;
  }
};

export default {
  clearAllCaches,
  clearDexieDatabase,
  clearServiceWorkerCache,
  resetInMemoryCounters,
  clearDraftBills,
  clearSerialCounters,
  getCacheStats,
};