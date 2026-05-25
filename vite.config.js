// vite.config.js
// ✅ PWA enabled with vite-plugin-pwa
// ✅ Service Worker auto-generated (NO manual sw.js needed!)
// ✅ Master Prompt compliant: Full offline + installable
// ✅ Network access for Chromebook + mobile

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,  // We manually call registerSW in main.jsx
      strategies: 'injectManifest',
      injectManifest: {
        swSrc: 'src/sw-custom.js',
        swDest: 'sw.js',
      },

      // ── Files to include in service worker pre-cache ───────
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "robots.txt",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-192.png",
        "icon-maskable-512.png",
        "sounds/*.mp3",
      ],

      // ── PWA Manifest (overrides public/manifest.json) ──────
      manifest: {
        name: "A One Jewelry POS",
        short_name: "AOne POS",
        description: "Professional Jewelry POS — Offline Ready",
        id: "/",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "browser"],
        theme_color: "#f59e0b",
        background_color: "#0a0805",
        orientation: "any",
        lang: "en",
        dir: "ltr",
        categories: ["business", "finance", "productivity"],
        prefer_related_applications: false,
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      // ── Workbox Service Worker config ──────────────────────
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,json}"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "/index.html",
        // Increase cache size for full offline app
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        runtimeCaching: [
          {
            // Google Fonts CSS
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-css",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Sound files — never change
            urlPattern: /\/sounds\/.*\.mp3$/,
            handler: "CacheFirst",
            options: {
              cacheName: "sound-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Firebase Firestore — Network First (fresh data preferred)
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firestore-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // Firebase Auth
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firebase-auth",
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Static images
            urlPattern: /\.(png|jpg|jpeg|svg|webp|gif|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // JS / CSS — Stale While Revalidate
            urlPattern: /\.(js|css|woff2?)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },

      // ── Dev mode (SW active during npm run dev) ────────────
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],

  // ── Build optimization ───────────────────────────────────
  build: {
    target: "esnext",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
          firebase: ["firebase/app", "firebase/firestore", "firebase/auth"],
          framer: ["framer-motion"],
          icons: ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },

  // ── Dev server ───────────────────────────────────────────
  server: {
    port: 3000,
    host: true,    // for network access (192.168.x.x)
    strictPort: true,
  },
});