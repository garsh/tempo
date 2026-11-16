# Tempo: Agent Guidelines & Instructions

## Project Overview
Tempo is a local-first, zero-backend Progressive Web App (PWA) for managing periodic and recurring routines (chores, habits, maintenance).
It syncs data to the user's private Google Drive hidden application folder (`drive.appdata`).

## Local GPU Subagent Offloading Policy (MANDATORY)
You have access to the `local-gpu-subagent` MCP server backed by a local RTX 5070 Ti. To conserve cloud quota, you MUST obey these routing rules on every turn:

1. **NEVER use native terminal/shell tools (`run_command`, `bash`, etc.) to run tests, builds, linters, or typechecks.**
   - Whenever executing tests, builds, linters, or typechecks (either requested by the user or when beneficial to verify changes), you MUST call the MCP tool `local_run_and_diagnose(command, cwd="~/work/tempo")`.
   - Pass the matching npm/npx script directly to `local_run_and_diagnose`:
     - **Unit Tests**: `npx vitest run`
     - **Build**: `npm run build`
     - **Typecheck**: `npx tsc -b`
     - **Lint**: `npm run lint`
   - Do NOT execute test runners or builds via your built-in terminal tool under any circumstances.
2. **NEVER read files over 150 lines directly into cloud context first.**
   - Call `local_inspect_file(file_path, question)` first to get exact line numbers and function signatures, then read only the targeted line range if editing is required.
3. **Use `local_draft_code(specification, reference_file_path)`** for initial boilerplate or test scaffolding.
4. **Use `local_analyze_git_diff(repo_path="~/work/tempo")`** when asked to review or summarize uncommitted changes.

## Agent Guidelines & Boundaries
- **Build & Test Verification**: Verify changes that affect the build or tests using `local_run_and_diagnose` from the `local-gpu-subagent` MCP server (e.g. `npm run build`, `npx vitest run`, or `npm run lint`). Do not run tests or builds if the only action taken was creating a commit (or other actions that do not alter the build output).
- **Git Commits**: Do NOT create Git commits automatically. Wait for the user to explicitly request the creation of a commit.

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
    3. **Browser / PWA updates**: Tempo uses `vite-plugin-pwa` in `prompt` mode with `PwaUpdatePrompt`. When a new build is deployed, clients check periodically (every 60s) and when regaining focus/visibility. Once the new service worker installs in the background, an "Update available" toast appears with a **Refresh** button to seamlessly activate and reload the new version.

## Architecture & Code Conventions
- **Client-Side Only**: No backend server. Data is stored in browser IndexedDB via Dexie.js and synced via Google Drive REST API (`tempo_backup.json`).
- **Conflict Resolution**: Item-level Last-Write-Wins (LWW) based on `updatedAt`, Set Union for `completionHistory`, and soft-delete tombstones (`deletedAt`).
- **TypeScript Rules**: `verbatimModuleSyntax` is enabled in `tsconfig.app.json`. Always use `import type { ... }` when importing types and interfaces.
- **Styling**: Tailwind CSS v4.
