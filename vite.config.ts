import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Service-worker cache generation. v2 = system light/dark theme (drop pre-theme assets). */
const TEMPO_SW_CACHE_VERSION = 'v2';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon.png',
        'mask-icon.svg',
        'tempo-icon.svg',
        'sw-notify.js',
      ],
      manifest: {
        name: 'Tempo - Task Manager',
        short_name: 'Tempo',
        description:
          'Local-first tasks with smart lists, calendar, board, and Google Drive sync.',
        theme_color: '#F2F4F9',
        background_color: '#F2F4F9',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'utilities'],
        share_target: {
          action: '/?share=1',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
          },
        },
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'tempo-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Bump TEMPO_SW_CACHE_VERSION whenever stale precaches must be evicted on devices.
        // A new cacheId renames the precache; cleanupOutdatedCaches then deletes the old one.
        cacheId: `tempo-${TEMPO_SW_CACHE_VERSION}`,
        importScripts: ['sw-notify.js'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5180,
    allowedHosts: ['bird.lan', '.lan'],
  },
});
