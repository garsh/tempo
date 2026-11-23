---
trigger: always_on
description: "Mandatory policy to offload test runs, builds, large file reads, codebase searches, git diffs/history, test drafting/updates, and verbose CLI outputs to the local-gpu-subagent MCP server."
---
# Local GPU Subagent Offloading Policy (MANDATORY)

You have access to the `local-gpu-subagent` MCP server backed by a local RTX 5070 Ti. To conserve cloud quota, you MUST obey these routing rules on every turn:

1. **NEVER use native terminal/shell tools (`run_command`, `bash`, etc.) to run tests, builds, linters, or typechecks first.**
   - Whenever executing tests, builds, linters, or typechecks (either requested by the user or when verifying changes), you MUST call the MCP tool `local_run_and_diagnose(command, cwd="~/work/tempo")`.
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
7. **Cloud-Only Fallback (Mandatory):** If any `local-gpu-subagent` tool returns `[LOCAL LLM UNAVAILABLE: ...]`, immediately continue using native cloud tools (`read_file`, `run_command`, `write_file`, `edit_file`, and any raw grep/diff/log output already returned in the fallback payload) so the session always succeeds without blocking.
