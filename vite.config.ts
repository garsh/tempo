import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Service-worker cache generation. v8 = hero dual-tone checkmark PWA icon. */
const TEMPO_SW_CACHE_VERSION = 'v8';

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', '-')),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'apple-touch-icon.png',
        'mask-icon.svg',
        'tempo-icon.svg',
        'sw-notify.js',
        'theme-init.js',
      ],
      manifest: {
        name: 'Tempo - Routine & Task Manager',
        short_name: 'Tempo',
        description:
          'Local-first PWA for managing periodic and recurring routines with calendar view and Google Drive sync.',
        theme_color: '#F2F4F9',
        background_color: '#F2F4F9',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'utilities'],
        share_target: {
          action: '/share',
          method: 'POST',
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
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'vendor',
              test: /node_modules/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5180,
    allowedHosts: ['bird.lan'],
  },
});
