# Tempo: Agent Guidelines & Instructions

## Project Overview
Tempo is a local-first, zero-backend Progressive Web App (PWA) for managing periodic and recurring routines (chores, habits, maintenance).
It syncs data to the user's private Google Drive hidden application folder (`drive.appdata`).

## Agent Guidelines & Boundaries
- **Git Commits**: Do NOT create Git commits automatically. Wait for the user to explicitly request the creation of a commit.
- **Running Tests**:
  - Do NOT run tests automatically as a general practice.
  - If you believe a test should be run to confirm that things still work, suggest that the user run it and print the command line to do so (e.g. `npx vitest run`).
  - **Exception**: If the AI adds a new test, it may run it to confirm that the new test passes.

## Commands & Workflows
- **Development Server**: `npm run dev`
  - Runs on port `5180` (binds to `0.0.0.0` / host: true).
  - Configured to accept `bird.lan:5180` (and `localhost:5180`).
  - **Updating**: Vite serves source files with Hot Module Replacement (HMR), so `src/` edits appear automatically. Restart `npm run dev` only if `vite.config.ts` or `package.json` dependencies change.
- **Run Unit Tests**: `npx vitest run`
- **Production Build & Server (`https://tempo.bot.nu`)**: `npm run build`
  - Served by the `caddy-proxy` Docker container (configured in `/home/bgarcia/work/ourmaps/Caddyfile`), which bind-mounts `/home/bgarcia/work/tempo/dist` read-only at `/srv/tempo`.
  - **Updating**:
    1. Run `npm run build` (`tsc -b && vite build`) to regenerate `dist/`.
    2. If `dist/` was ever deleted and recreated rather than updated in-place, run `docker restart caddy-proxy` so the bind mount reattaches to the new directory.
    3. **Browser / PWA cache**: Because Tempo uses `vite-plugin-pwa` (Workbox `autoUpdate`), the first refresh after a build may still serve the previously cached Service Worker bundle while the new `sw.js` installs. Refresh a second time (or hard-reload / click **Update** in Chrome DevTools → **Application → Service Workers**) to load the new version.

## Architecture & Code Conventions
- **Client-Side Only**: No backend server. Data is stored in browser IndexedDB via Dexie.js and synced via Google Drive REST API (`tempo_backup.json`).
- **Conflict Resolution**: Item-level Last-Write-Wins (LWW) based on `updatedAt`, Set Union for `completionHistory`, and soft-delete tombstones (`deletedAt`).
- **TypeScript Rules**: `verbatimModuleSyntax` is enabled in `tsconfig.app.json`. Always use `import type { ... }` when importing types and interfaces.
- **Styling**: Tailwind CSS v4.
