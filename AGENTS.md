# Tempo: Agent Guidelines & Instructions

## Project Overview
Tempo is a local-first, zero-backend Progressive Web App (PWA) for managing periodic and recurring routines (chores, habits, maintenance).
It syncs data to the user's private Google Drive hidden application folder (`drive.appdata`).

## Commands & Workflows
- **Development Server**: `npm run dev`
  - Runs on port `5180` (binds to `0.0.0.0` / host: true).
  - Configured to accept `bird.lan:5180`.
- **Run Unit Tests**: `npx vitest run`
- **Production Build**: `npm run build`

## Architecture & Code Conventions
- **Client-Side Only**: No backend server. Data is stored in browser IndexedDB via Dexie.js and synced via Google Drive REST API (`tempo_backup.json`).
- **Conflict Resolution**: Item-level Last-Write-Wins (LWW) based on `updatedAt`, Set Union for `completionHistory`, and soft-delete tombstones (`deletedAt`).
- **TypeScript Rules**: `verbatimModuleSyntax` is enabled in `tsconfig.app.json`. Always use `import type { ... }` when importing types and interfaces.
- **Styling**: Tailwind CSS v4.
