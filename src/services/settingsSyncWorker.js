// src/services/settingsSyncWorker.js
// ─────────────────────────────────────────────────────────────
// Background Sync Worker for Super Admin settings, role permissions and
// runtime feature toggles.
//
// When the Super Admin changes a permission/toggle OFFLINE, settingsStore
// queues a durable `setting:update` op in `aone_local_db_v1.syncQueue`. This
// worker replays those ops to the live Firestore `settings/{key}` documents
// automatically as soon as connectivity returns (window 'online'), on tab
// focus, and on a periodic timer.
//
// Guarantees:
//   • Latest-write-wins per key — only the FINAL value of each key is pushed,
//     so a burst of offline toggles collapses into one clean server write.
//   • Idempotent — replays use merge writes; re-runs are safe.
//   • Resilient — exponential backoff + dead-letter after MAX_ATTEMPTS.
//   • Self-healing — synced ops are pruned so the queue never grows unbounded.
// ─────────────────────────────────────────────────────────────

import localDB, { getSyncQueue } from './localDB';
import { isFirebaseReady, db as firestore } from './firebase';
import { pushSettingToServer, SETTING_OP } from './settingsStore';
import { pullAllSettingsFromServer } from './settingsRemoteSync';
import { getHasInternet } from '../utils/networkReachability';

const MAX_ATTEMPTS = 6;
const PERIODIC_MS = 30_000;
const RECONNECT_RECHECK_MS = 2500;

let _running = false;
let _started = false;
let _cleanup = null;

const _isOnline = () => getHasInternet();

// ── Queue helpers ─────────────────────────────────────────────
const _pendingSettingOps = async () => {
  const all = await getSyncQueue();
  return (all || []).filter(
    (op) =>
      op?.type === SETTING_OP &&
      op.status !== 'synced' &&
      op.status !== 'forbidden' &&
      op.status !== 'dead_letter',
  );
};

const _opTime = (op) => Number(op?.payload?.updatedAt || op?.createdAt || 0);

/**
 * Collapse ops to the newest per key while keeping every op id for that key,
 * so we can resolve the whole group together once the latest value is pushed.
 */
const _groupLatestPerKey = (ops) => {
  const groups = new Map();
  ops.forEach((op) => {
    const key = op?.payload?.key;
    if (!key) return;
    const g = groups.get(key) || { key, latest: op, ids: [] };
    g.ids.push(op);
    if (_opTime(op) >= _opTime(g.latest)) g.latest = op;
    groups.set(key, g);
  });
  return [...groups.values()];
};

const _patchOp = async (op, patch) => {
  try {
    if (op?.opId) {
      await localDB.syncQueue.where('opId').equals(op.opId).modify(patch);
    } else if (op?.id != null) {
      await localDB.syncQueue.update(op.id, patch);
    }
  } catch (e) {
    console.warn('[settingsSync] mark op failed', e?.message || e);
  }
};

const _patchGroup = async (ops, patch) => {
  await Promise.all((ops || []).map((op) => _patchOp(op, patch)));
};

const _pruneSyncedSettingOps = async () => {
  try {
    const all = await getSyncQueue();
    const stale = (all || []).filter(
      (op) => op?.type === SETTING_OP && op.status === 'synced',
    );
    await Promise.all(
      stale.map((op) => {
        try {
          return localDB.syncQueue.delete(op.id);
        } catch {
          return Promise.resolve();
        }
      }),
    );
  } catch {
    /* non-critical */
  }
};

const _backoff = (attempts) =>
  new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** Math.max(0, attempts - 1))));

// ── Replay ────────────────────────────────────────────────────
/**
 * Replay all pending settings/permissions ops to the live server.
 * Single-flight; safe to call as often as you like.
 */
export const replayPendingSettings = async () => {
  if (_running) return { synced: 0, skipped: true };
  if (!_isOnline()) return { synced: 0, offline: true };
  if (!isFirebaseReady() || !firestore) return { synced: 0, notReady: true };

  _running = true;
  let synced = 0;
  let failed = 0;

  try {
    await _pruneSyncedSettingOps();

    const pending = await _pendingSettingOps();
    if (!pending.length) return { synced: 0 };

    const groups = _groupLatestPerKey(pending);

    for (const { key, latest, ids } of groups) {
      const value = latest?.payload?.value;
      try {
        const ok = await pushSettingToServer(key, value);
        if (ok) {
          await _patchGroup(ids, { status: 'synced', syncedAt: Date.now() });
          synced += 1;
        } else {
          // Not pushed (offline / not permitted / not ready). Keep pending and
          // count an attempt; dead-letter only after persistent rejection.
          const attempts = (latest?.attempts || 0) + 1;
          await _patchGroup(
            ids,
            attempts >= MAX_ATTEMPTS
              ? { status: 'dead_letter', attempts, lastError: 'push rejected' }
              : { attempts },
          );
        }
      } catch (e) {
        failed += 1;
        const attempts = (latest?.attempts || 0) + 1;
        await _patchGroup(
          ids,
          attempts >= MAX_ATTEMPTS
            ? { status: 'dead_letter', attempts, lastError: String(e?.message || e) }
            : { status: 'failed', attempts, lastError: String(e?.message || e) },
        );
        await _backoff(attempts);
      }
    }

    if (synced > 0) {
      console.log(`[settingsSync] ✅ replayed ${synced} setting(s) to server`);
      await _pruneSyncedSettingOps();
    }
    return { synced, failed };
  } catch (e) {
    console.warn('[settingsSync] replay error', e?.message || e);
    return { synced, failed, error: true };
  } finally {
    _running = false;
  }
};

// ── Lifecycle ─────────────────────────────────────────────────
/**
 * Start the worker: wires `window.online`, tab-focus and a periodic timer, and
 * runs an immediate pass. Idempotent — repeated calls return the same stopper.
 */
export const startSettingsSyncWorker = ({ periodicMs = PERIODIC_MS } = {}) => {
  if (_started) return _cleanup;
  _started = true;

  const trigger = () => {
    replayPendingSettings()
      .then((result) => {
        if (result?.synced > 0) {
          // After Super Admin push, ensure this device has latest merged state
          pullAllSettingsFromServer().catch(() => {});
        }
      })
      .catch(() => {});
  };

  const onOnline = () => {
    console.log('[settingsSync] 🌐 online — replaying queued settings changes');
    trigger();
    // Second pass catches races from Firebase auth / DB re-initialisation.
    setTimeout(trigger, RECONNECT_RECHECK_MS);
  };

  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      trigger();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
  const interval = setInterval(trigger, periodicMs);

  trigger(); // initial pass

  _cleanup = () => {
    try {
      window.removeEventListener('online', onOnline);
    } catch {
      /* ignore */
    }
    try {
      document.removeEventListener('visibilitychange', onVisible);
    } catch {
      /* ignore */
    }
    clearInterval(interval);
    _started = false;
    _cleanup = null;
  };

  return _cleanup;
};

export default { replayPendingSettings, startSettingsSyncWorker };
