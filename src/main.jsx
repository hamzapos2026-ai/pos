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

// ── IndexedDB (non-blocking) ─────────────────────────────────
import('./services/indexedDBService.js')
  .then(m => m.openDB())
  .then(() => console.log('[IndexedDB] ✅ ready'))
  .catch(err => console.warn('[IndexedDB] init failed:', err));

// ── Bill sync worker ─────────────────────────────────────────
import('./services/syncWorker.js')
  .then(m => {
    m.startSyncWorker(15_000);
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

// Kick-start sync queue
import('./services/syncService.js')
  .then(m => m.processQueue?.())
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);