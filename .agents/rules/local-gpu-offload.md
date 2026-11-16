---
trigger: always_on
description: "Mandatory policy to offload test runs, builds, large file reads, git diff reviews, and boilerplate generation to the local-gpu-subagent MCP server."
---
# Local GPU Subagent Offloading Policy (MANDATORY)

You have access to the `local-gpu-subagent` MCP server backed by a local RTX 5070 Ti. To conserve cloud quota, you MUST obey these routing rules on every turn:

1. **NEVER use native terminal/shell tools (`run_command`, `bash`, etc.) to run tests, builds, linters, or typechecks.**
   - Whenever executing tests, builds, linters, or typechecks (either requested by the user or when verifying changes), you MUST call the MCP tool `local_run_and_diagnose(command, cwd="~/work/tempo")`.
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
