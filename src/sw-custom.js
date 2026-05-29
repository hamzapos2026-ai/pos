/* src/sw-custom.js
   InjectManifest source for VitePWA — adds background sync handlers
*/
import { precacheAndRoute } from 'workbox-precaching';

// Precache manifest will be injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Listen for background sync events (SyncManager)
self.addEventListener('sync', (event) => {
  if (!event.tag) return;
  if (event.tag === 'sync-queue') {
    event.waitUntil((async () => {
      try {
        // Notify clients to process the queue
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const c of clients) {
          c.postMessage({ type: 'PROCESS_QUEUE', source: 'sw-sync' });
        }
      } catch (err) {
        console.error('[SW] sync handler failed:', err?.message || err);
      }
    })());
  }
});

// Periodic Sync (best-effort)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-sync-queue') {
    event.waitUntil((async () => {
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const c of clients) c.postMessage({ type: 'PROCESS_QUEUE', source: 'sw-periodic' });
      } catch (err) { console.error('[SW] periodicsync failed:', err?.message || err); }
    })());
  }
});

// Fallback message handler — optional logging
self.addEventListener('message', (ev) => {
  // Keep for debugging and future commands
  // ev.data may include commands like {type: 'PING'}
});

// Intercept token refresh requests to securetoken.googleapis.com when offline
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    if (url.hostname && url.hostname.includes('securetoken.googleapis.com')) {
      const swOnline = (typeof self.navigator !== 'undefined' && typeof self.navigator.onLine === 'boolean') ? self.navigator.onLine : true;
      if (!swOnline) {
        event.respondWith(new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
    }
  } catch (e) {
    // ignore
  }
});
