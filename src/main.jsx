// src/main.jsx
// ✅ AuthProvider ONLY here — NOT in App.jsx
// ✅ SettingsProvider here
// ✅ BrowserRouter here
// ✅ Sync workers started here
// ✅ PWA registered here

import React, { StrictMode }  from 'react';
import { createRoot }         from 'react-dom/client';
import { BrowserRouter }      from 'react-router-dom';

import App                    from './App.jsx';
import './styles/index.css';

import { AuthProvider }       from './context/AuthContext.jsx';
import { SettingsProvider }   from './context/SettingsContext.jsx';
import { LanguageProvider }   from './context/LanguageContext.jsx';

// ── IndexedDB — MUST open Dexie before sync workers ──────────
import('./db/index.js')
  .then((m) => m.initDatabase())
  .then((db) => {
    if (!db) console.warn('[Dexie] opened with warnings — offline mode may retry');
    else console.log('[Dexie] ✅ ready');
  })
  .catch((err) => console.warn('[Dexie] init failed:', err?.message || err));

import('./services/indexedDBService.js')
  .then(m => m.openDB())
  .then(() => console.log('[IndexedDB] ✅ ready'))
  .catch(err => console.warn('[IndexedDB] init failed:', err));

// ── Bill sync worker (after Dexie init) ───────────────────────
Promise.resolve()
  .then(() => import('./db/index.js').then((m) => m.initDatabase()))
  .then(() => import('./services/syncWorker.js'))
  .then(m => {
    m.startSyncWorker(5_000);
    console.log('[SyncWorker] ✅ started');
  })
  .catch(err => console.warn('[SyncWorker] failed:', err));

// ── Cashier payment sync worker ──────────────────────────────
import('./services/cashierSyncWorker.js')
  .then(m => {
    m.startSyncWorker();
    console.log('[CashierSyncWorker] ✅ started');
  })
  .catch(err => console.warn('[CashierSyncWorker] failed:', err));

// ── Settings sync: outbound (PC1 queue → Firestore) + inbound (Firestore → all PCs)
import('./services/settingsSyncWorker.js')
  .then(m => {
    m.startSettingsSyncWorker();
    console.log('[SettingsSyncWorker] ✅ outbound started');
  })
  .catch(err => console.warn('[SettingsSyncWorker] failed:', err));

import('./services/settingsRemoteSync.js')
  .then(m => {
    m.startSettingsRemoteSync();
    console.log('[SettingsRemoteSync] ✅ inbound started (all PCs)');
  })
  .catch(err => console.warn('[SettingsRemoteSync] failed:', err));

// ── Scheduled backup runner (daily / weekly / monthly) ───────
import('./services/backupService.js')
  .then(m => {
    m.initScheduledBackupRunner();
    console.log('[BackupService] ✅ scheduled runner started');
  })
  .catch(err => console.warn('[BackupService] runner failed:', err));

// ── PWA Service Worker ───────────────────────────────────────
import { registerSW } from 'virtual:pwa-register';

let _updateSW;
try {
  _updateSW = registerSW({
    onNeedRefresh() {
      if (window.confirm('🚀 New version available. Update now?')) {
        _updateSW?.(true);
      }
    },
    onOfflineReady() {
      console.log('[PWA] ✅ Ready for offline use');
    },
    onRegistered(reg) {
      console.log('[PWA] ✅ SW registered');
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
    onRegisterError(err) {
      console.warn('[PWA] SW registration failed:', err?.message);
    },
  });
} catch (e) {
  console.warn('[PWA] registerSW failed:', e?.message);
}

// ── Background sync bridge ───────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (ev) => {
    if (ev.data?.type === 'PROCESS_QUEUE') {
      try {
        const { processQueue } = await import('./services/syncService.js');
        await processQueue();
      } catch {}
    }
  });

  navigator.serviceWorker.ready
    .then(async reg => {
      try {
        if ('sync' in reg) {
          await reg.sync.register('sync-queue');
          console.log('[PWA] ✅ Background sync registered');
        }
      } catch {}
    })
    .catch(() => {});
}

// ── Root guard ───────────────────────────────────────────────
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[AOne POS] #root element not found in index.html');
}

// Kick-start sync queue + preload settings SSoT (offline admin pages)
import('./services/settingsStore.js')
  .then(async (m) => {
    await m.hydrateSettings?.();
  })
  .catch(() => {});

import('./services/syncService.js')
  .then(m => m.processQueue?.())
  .catch(() => {});

// ── Speech: preload voices + prime on first user gesture (Chromebook / Chrome) ──
import('./utils/countingSpeech.js')
  .then((m) => {
    m.ensureSpeechVoices?.().catch(() => {});
    const primeOnce = () => {
      m.ensureUrduVoicesReady?.().catch(() => {});
      m.primeSpeechEngine?.();
      window.removeEventListener('pointerdown', primeOnce, true);
      window.removeEventListener('keydown', primeOnce, true);
    };
    window.addEventListener('pointerdown', primeOnce, true);
    window.addEventListener('keydown', primeOnce, true);
  })
  .catch(() => {});

// ── Render ───────────────────────────────────────────────────
createRoot(rootElement).render(
  <StrictMode>
    {/*
      ✅ AuthProvider ONLY here
      ✅ App.jsx does NOT have AuthProvider
    */}
    <AuthProvider>
        <SettingsProvider>
          <LanguageProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </LanguageProvider>
        </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);