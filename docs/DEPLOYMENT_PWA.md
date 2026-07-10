# Deployment & PWA Notes

This file contains step-by-step deployment notes for the A One Jewelry POS web app, PWA, and service worker.

> **Shop floor (offline biller + cashier, multi-PC, multi-branch):** see [OFFLINE_SHOP_DEPLOYMENT_GUIDE.md](./OFFLINE_SHOP_DEPLOYMENT_GUIDE.md)

Prerequisites
- Node >= 18, npm
- HTTPS hosting (service workers require secure context)

Local build

1. Install dependencies

```bash
npm install
```

2. Development (with PWA enabled)

```bash
npm run dev
```

Notes: `vite-plugin-pwa` is enabled in development (`devOptions.enabled: true`) to allow testing SW locally. Use a secure tunnel (ngrok) if testing on mobile.

Production build

```bash
npm run build
npm run preview    # serves the built app
```

Service Worker / Workbox notes
- We use `injectManifest` (see `vite.config.js`) with `src/sw-custom.js` as the SW source. The build injects `__WB_MANIFEST`.
- Do not commit generated `sw.js` or `workbox-*.js` files — they are build artifacts.
- Ensure server serves `sw.js` at the app root (`/sw.js`) and enables proper caching headers.

Background Sync testing
- The app registers a background sync tag `sync-queue` on service worker ready. To test:
  1. Put the app offline (DevTools > Offline).
  2. Create an order (it will be saved in local DB and queued).
  3. Go online, or trigger SW `sync` event via DevTools → Application → Service Workers → "Sync".
  4. Observe `processQueue()` being called in app consoles and Firestore writes.

CI example (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build

```

Server considerations
- Firestore rules must allow reading the `settings/setup` doc for the initial check, or the app will treat permission-denied as "setup complete" to avoid accidental re-run.
- Ensure `globalCounters/billSerial` and `orders` path are writable by the server-side rules used by the app.

Security
- Use HTTPS for all hosts running the PWA. Service workers & WebCrypto require secure contexts.
- Protect Firestore with proper rules; limit writes to `settings/setup` to Super Admin only in production.
