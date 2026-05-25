# Offline-First Billing POS — Architecture Summary

This document summarizes the offline-first design, sync rules, security, and deployment notes for the A One Jewelry POS application.

Scope
- Offline-first login and session restore (IndexedDB + encrypted localStorage fallback)
- One-time setup guard (server + encrypted local flag)
- Local primary DB: Dexie (IndexedDB) with `orders`, `sync_queue`, `settings`, `sessions` stores
- Background sync via Service Worker (SyncManager + Periodic Sync) and in-app sync workers
- Conflict resolution: Server wins with local backup
- Encryption: AES-GCM for local flags and sessions; bcrypt for cached password hashes

Key Components
- `src/services/authService.js` — smartLogin (online-first, offline fallback), offline cache
- `src/services/indexedDBService.js` — master IndexedDB schema and sync-queue helpers
- `src/services/localSyncService.js` — main sync engine, dedup, retry/backoff, conflict resolution
- `src/services/setupGuardService.js` — encrypted setup flag (IDB + localStorage) and server write
- `src/services/sessionService.js` — encrypted offline session storage
- `src/sw-custom.js` and `vite.config.js` — custom SW (injectManifest) with `sync` handlers

Sync Rules
- Online: pull updates silently, update local cache
- Offline: operate from local Dexie DB, enqueue operations in `sync_queue`
- Reconnect: process queue, idempotent writes using `localId` as doc ID
- Duplicate prevention: check `localId` and `billId` before writes
- Conflict resolution: server wins — when a write fails, fetch server doc, back up local record in `deleted_records` and apply server data locally

Security
- AES-GCM (WebCrypto) is used to encrypt persistent local flags and offline sessions
- `bcryptjs` is used (client-side) to hash cached passwords when available; fallback to SHA-256 for legacy compat
- No "Forgot Password" flows in the app UI (per product requirement)

PWA & Background Sync
- `vite-plugin-pwa` configured with `injectManifest` to include `src/sw-custom.js`
- SW listens for `sync` and `periodicsync` events and posts messages to clients to run `processQueue()`
- App registers `sync-queue` tag on SW ready and listens for messages to process queue

Deployment Notes
- Ensure HTTPS and proper service-worker headers
- Allow Workbox to generate the precache manifest (do not commit generated SW)
- On server, provide `settings/setup` Firestore document to permanently lock setup page

Tests & Validation
- The codebase includes unit and integration tests (Vitest). Key tests to add:
  - Sync conflict resolution (simulate write failures and server doc present)
  - Offline login restore using encrypted session
  - Setup guard correctness (server missing → use encrypted flag)

If you'd like, I can add runnable tests for the conflict-resolution flow next.
