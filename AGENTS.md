# Tempo: Agent Guidelines & Instructions

## Project Overview
Tempo is a local-first, zero-backend Progressive Web App (PWA) for managing periodic and recurring routines (chores, habits, maintenance).
It syncs data to the user's private Google Drive hidden application folder (`drive.appdata`).

## Local GPU Subagent Offloading Policy (MANDATORY)
You have access to the `local-gpu-subagent` MCP server backed by a local RTX 5070 Ti. To conserve cloud quota, you MUST obey these routing rules on every turn:

1. **NEVER use native terminal/shell tools (`run_command`, `bash`, etc.) to run tests, builds, linters, or typechecks first.**
   - Whenever executing tests, builds, linters, or typechecks (either requested by the user or when beneficial to verify changes), you MUST call the MCP tool `local_run_and_diagnose(command, cwd="~/work/tempo")`.
   - Pass the matching npm/npx script directly to `local_run_and_diagnose`:
     - **Unit Tests**: `npx vitest run`
     - **Build**: `npm run build`
     - **Typecheck**: `npx tsc -b`
     - **Lint**: `npm run lint`
   - Passing runs (`exit 0`) succeed locally with zero LLM calls even if the GPU LLM is offline.
2. **NEVER read files over 150 lines directly into cloud context first; skip `local_inspect_file` for single small files (≤ 150 lines).**
   - For files over 150 lines, call `local_inspect_file(file_path, question, cwd="~/work/tempo", extra_file_paths=...)` first to get exact file paths, line numbers, and function signatures, then read only the targeted line range if editing is required. Always pass an absolute `file_path` (or provide `cwd="~/work/tempo"`), and pass `extra_file_paths=[...]` when answering a question spanning 2–5 related files in one turn.
   - For single files ≤ 150 lines, skip `local_inspect_file` and read the file directly with your native file-reading tool.
3. **Use `local_search_codebase(pattern, question, cwd="~/work/tempo", glob="")`** instead of multi-turn native `grep`/`rg` + `read_file` chains when tracing usages or flows across files.
4. **Use `local_draft_code` and `local_update_test_file` for test scaffolding and boilerplate:**
   - For new files, call `local_draft_code(specification, reference_file_path, output_path="<path>", cwd="~/work/tempo")` (and `overwrite=True` only when intentionally replacing an existing file) so the local LLM writes directly to disk instead of burning cloud output tokens. Do NOT natively `read_file` `reference_file_path` just to pass it in.
   - For incremental updates to existing test files ≤ 20,000 chars, prefer `local_update_test_file(file_path, specification, reference_file_path, cwd="~/work/tempo")`. Verify generated/updated files with `local_run_and_diagnose`.
5. **Use `local_analyze_git_diff` and `local_git_history` for git diffs and commit archaeology:**
   - Use `local_analyze_git_diff(repo_path="~/work/tempo", task=..., ref_range="HEAD", paths="")` for working-tree, staged (`"--cached"`), commit-range (`"a..b"`), or single-commit (`"<sha>^!"`) diffs.
   - Use `local_git_history(repo_path="~/work/tempo", task=..., query="", paths="")` instead of native `git log`, `git show`, or `git log -S`.
6. **Use `local_run_and_summarize(command, question, cwd="~/work/tempo")`** for read-only informational commands with large outputs (e.g., `modern-web-guidance` searches, logs, CSV/JSON inspections).
7. **Cloud-Only Fallback (Mandatory):**
   - **Do NOT silently fall back to cloud-only** the first time in a session that a `local-gpu-subagent` tool returns `[LOCAL LLM UNAVAILABLE: ...]`.
   - Instead, **stop and ask the user** (using `ask_question` when available, or plain text in CLI sessions) whether they want to:
     1. **Start/restart the local LLM server** (`192.168.253.103:8080`) — once they confirm it is up, call `local_check_health()` to verify connectivity and retry; or
     2. **Continue cloud-only for the rest of this session** — once approved, proceed directly with native tools (`read_file`, `run_command`, `write_file`, `edit_file`, and any fallback payload already returned) without asking again in that session.
   - Non-LLM fast paths (passing `local_run_and_diagnose` runs on `exit 0`, small-file `local_inspect_file`, short outputs) continue working without interrupting the user.

## Agent Guidelines & Boundaries
- **Build & Test Verification**: When making a change that affects the app, run these with `local_run_and_diagnose` (cwd `~/work/tempo`) and confirm each succeeds before finishing:
  - `npm run build`
  - `npx vitest run`
  - `npm run lint`
  Do not run them if the only action taken was creating a commit, or if the edit cannot change build, test, or lint output (for example this guidelines file). `npm run build` already runs `tsc -b`, so do not also run a separate typecheck.
- **Git Commits**: Do NOT create Git commits automatically. Wait for the user to explicitly request the creation of a commit.
- **Implementation Plans & Handling Investigations**: Whenever the user asks you to plan something or whenever producing an implementation plan for review, ALWAYS write the plan to a dedicated user-facing `implementation_plan.md` artifact (`UserFacing: true`, `RequestFeedback: true`) rather than posting it only inline in chat, so the user can review and add inline comments directly on the document. If running in read-only plan mode where `write_file` is blocked, hand off via `exit_plan_mode` solely to write the `implementation_plan.md` artifact and then stop for user review without implementing the planned code changes yet. If the user asks you to locate bugs or inefficiencies in the code, and you find several, list them in that implementation plan file (identified by capital letters). Include a description, example user scenarios to trigger it (understandable to an end-user, in addition to any more technical description), and the best fix. Also include a status for each item (planned, implemented, skipped). Estimate a complexity of each fix (how likely it is to introduce new bugs).
- **Modern Web Guidance Disclosure**: Do NOT include the `### Modern Web Guidance` disclosure section in chat responses, even when the `modern-web-guidance` skill is consulted.

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
