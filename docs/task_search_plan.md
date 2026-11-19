# Tempo: Task Search Implementation Plan

> [!NOTE]
> Status: **Implemented**. Task search has been implemented and verified (`npx vitest run`, `npm run build`, `npm run lint`).

---

## 1. Resolved Design Decisions

1. **Presentation**: In-place Search Mode (unmounting the calendar subtree while Search is open and restoring day-list `scrollTop` when closing without jumping).
2. **Completed tasks**: Always shown below Active matches in the same collapsible `Completed` group (`TaskGroupHeader`) used by the day list. Ignores `prefs.hideCompleted` (neither the day list nor the month grid reads that preference). No `All / Active / Completed` filter chips and no `"Show N completed matches"` button.
3. **Clicking a search result**:
   - Clicking/tapping a **dated** search result closes Search and **jumps directly to that day on the calendar** via `applyCalendarTarget` (`src/App.tsx`, lines 146–159). If jumping to a completed task, `collapsedGroups['cal-completed']` is expanded so the task is immediately visible.
   - Clicking/tapping an **undated** search result (an open or completed one-off task with `dueAt == null`, or an ended recurring task with an empty `completionHistory`) opens `QuickAddSheet` via `handleEdit` since it does not appear on any calendar day.
   - Checkbox (complete/uncomplete) and swipe actions (Change Date, Skip Occurrence, Delete) work directly in place using the exact same projected task and existing `App.tsx` handlers (`handleComplete`, `handleUncomplete`, `handleRequestChangeDate`, `setSkipOccurrenceTask`, `setDeleteConfirmTask`).
4. **Searchable fields**: `title` and `notes` only (do not match human-readable recurrence labels). `priority`, `pinned`, `tags`, and `subtasks` are `@deprecated` in `src/types/task.ts` (lines 56–63), and `listId` is a live schema field (line 52); exclude all five from matching because none are displayed in the UI.
5. **Entry points**:
   - Add a `Search` menu item (`Search` icon from `lucide-react` + `"Search"` label) inside `src/components/menu/OverflowMenu.tsx`. Keep the top calendar header icons and button widths (`w-9 h-9`) unchanged.
   - Desktop keyboard shortcut: `/` only (via `src/hooks/useKeyboardShortcuts.ts`). Do **not** add `⌘K` / `Ctrl+K` (the hook returns early when `metaKey || ctrlKey || altKey` is set at line 40, and those shortcuts conflict with browser address-bar focus).
   - Guard `/` so it does nothing while Quick Add, Settings, OverflowMenu, Month/Year picker, Skip Occurrence, Delete Confirm, or Shortcuts Help is open.
   - Closing Search (via Back or Escape) restores focus to the header `⋮` ("More options") button (`moreButtonRef`) after the calendar header remounts into the DOM.
6. **Minimal scope (no extras)**: No recent searches (`localStorage`), no Create-from-query CTA, no 50-row cap, and keep the `+` FAB visible (results container uses `pb-20 xl:pb-4` padding just like the day list).

---

## 2. UX & Layout Architecture

### In-Place Search Mode & Calendar Subtree Lifecycle
When Search opens:
- **Header** swaps to a `<search>` landmark (not wrapped in a `<form>`, so `Enter` never triggers navigation):
  - `[← Back]` button (closes Search and restores focus to `moreButtonRef`)
  - `<input type="search">` sized at `16px` (`text-base`) to prevent iOS Safari zoom, with `enterKeyHint="search"`, `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, and an explicit visually hidden `<label>`
  - `[✕ Clear]` button when `searchQuery` is non-empty
- **Main viewport** unmounts the calendar subtree (`calAreaRef`, `CalendarMonthView`, and day list) and renders the scrollable search results container (`pb-20 xl:pb-4`) directly:
  - Unmounting rather than hiding with CSS keeps `calAreaRef`'s pull-to-expand touch listeners (`src/App.tsx`, lines 327–401) from intercepting vertical drags (`e.preventDefault()`) and keeps hidden month controls out of the keyboard tab order.
  - Existing task action layers—`src/components/QuickAddSheet.tsx` (`z-[60]`), `src/components/dialogs/DeleteConfirmDialog.tsx` (`z-50`, line 46), `src/components/dialogs/SkipOccurrenceDialog.tsx` (`z-50`, line 59), and `src/components/dialogs/ChangeDatePicker.tsx` (`showPicker()`)—continue to open cleanly above Search without top-layer trapping or z-index conflicts.
  - **Touch-listener re-attachment**: Add `isSearchOpen` to `calAreaRef`'s touch-listener `useEffect` dependency array (`src/App.tsx`, line 401: `[calExpanded, isSearchOpen]`) so pull-to-expand touch listeners re-attach cleanly when the calendar remounts after closing Search.
  - **Scroll restoration**: Capture `calScrollRef.current?.scrollTop` when opening Search; restore it via `useLayoutEffect` when closing Search without jumping to a date, and discard the saved offset when jumping to a date.

### Result Rows, Highlighting & Snippets
Each matched task renders via `src/components/TaskCard.tsx` with `reorderEnabled={false}`:
- **Projected task consistency**: Pass the exact projected `Task` shape that the day list passes to `TaskCard`, `handleComplete`, `handleUncomplete`, `handleEdit` (for undated tasks), and swipe dialogs (`ChangeDatePicker`, `SkipOccurrenceDialog`, `DeleteConfirmDialog`) so no secondary edit path shifts a recurring series's date unexpectedly.
- **Ended recurring series safety**: `completeTask` (`src/db/db.ts`, lines 275–298) always sets `completedAt: null` on recurring tasks and would append a bogus completion entry if triggered on an ended series. Render ended recurring rows with a display projection setting `completedAt: latestCompletionTs ?? t.updatedAt` and `dueAt: latestCompletionDate ?? t.dueAt`, passing `onUncomplete={undefined}` and `onRequestSkipOccurrence={undefined}`.
  - `TaskCard` already disables the checkbox when `completed && !onUncomplete` (`src/components/TaskCard.tsx`, line 474).
  - Also update `TaskCard` (line 432) from `disabled={!recurring}` to `disabled={!recurring || !onRequestSkipOccurrence}` so the Skip Occurrence swipe action is disabled on ended recurring rows.
- **`<mark>` highlighting (single path)**: Render matched substrings with declarative React `<mark>` spans styled via `.tt-search-mark` for WCAG AA ≥4.5:1 contrast in both light and dark modes. Dropping `CSS.highlights` avoids `happy-dom` test gaps and stale `Range` references when checkbox toggles re-render text nodes.
- **Windowed notes snippet**: When a query matches inside `task.notes`, compute a short window centered around the first matched substring so CSS `truncate` does not clip the match out of view. When `notesSnippet` is passed to `TaskCard`, it **replaces** the `showDetails` preview (always one line, never two).
- **Empty & zero-results states**:
  - Empty or whitespace-only query: show the prompt (`"Search by title or notes"`), not every task.
  - Zero results: `"No tasks matching \"<query>\""`.

---

## 3. Search Semantics & Domain Logic

Create a pure domain module `src/domain/search.ts` operating on `activeTasks` (`!t.deletedAt`, live-loaded via Dexie `useLiveQuery` in `src/App.tsx`, lines 267–278):

### Classification (Branch Before Calling `getNextUncompletedOccurrenceDate`)
Because `getNextUncompletedOccurrenceDate` (`src/domain/recurrence.ts`, lines 709–768) returns `null` for both undated open one-off tasks and ended recurring series, branch on task type first:
- **One-off (`!t.recurrence`) with `!t.completedAt`**: **Active** (including undated tasks where `dueAt == null`). Jump date = `t.dueAt ? getDueDatePart(t.dueAt) : null`.
- **One-off (`!t.recurrence`) with `!!t.completedAt`**: **Completed**. Jump date = `t.dueAt ? getDueDatePart(t.dueAt) : null` (matches `taskOccursOnDate` in `src/domain/recurrence.ts`, line 634).
- **Recurring (`!!t.recurrence`) with `nextDate != null`**: One **Active** row projected via `projectTaskForDate(t, nextDate)`. Jump date = `nextDate`.
- **Recurring (`!!t.recurrence`) with `nextDate == null`**: **Completed / ended** row (`completable: false`). Jump date = latest completion date in `t.completionHistory` (`formatDate(new Date(maxTs))`) if non-empty (matches `completedDates.has(dateStr)` in `src/domain/recurrence.ts`, line 639), else `null`.

### Normalization, Matching & Ranking
- **Normalization**: `trim()`, case-fold (`.toLowerCase()`), and NFD combining-mark stripping (`\p{Diacritic}`). Split normalized query on whitespace; every token must be a substring of normalized `title` or normalized `notes` (AND match, no phrase quotes).
- **Sorting (do not use `sortTasksForDailyView`, whose first key is per-day `sortOrder`)**:
  - **Active rows**: Exact normalized title match or normalized title starting with normalized query sorts first; then projected due date ascending (`overdue` → `today` → `upcoming`, undated last); then `title.localeCompare`.
  - **Completed rows**: Exact normalized title match or normalized title starting with normalized query sorts first; then `completedAt` descending (using latest `completionHistory` timestamp or `updatedAt` for ended recurring rows); then `title.localeCompare`.

### Performance & Caching
- Run normalized `title` / `notes` token matching **first** so unmatched recurring tasks never invoke `getNextUncompletedOccurrenceDate`.
- Cache `getNextUncompletedOccurrenceDate` results keyed by `(task.id, task.updatedAt, task.completionHistory.length, todayStr)` so the 365-day lookback / 1100-day forward walk is not recomputed on every keystroke.
- Wrap the query passed to the search memo in React 19's `useDeferredValue(query)` while keeping the controlled `<input>` value updated synchronously.

---

## 4. Keyboard, IME & Accessibility Details

- **IME-safe `Enter` & result arrow navigation**: Handle `ArrowDown`, `ArrowUp`, and `Enter` directly on the search `<input>` (since `useKeyboardShortcuts` ignores non-Escape keys while typing). Guard `Enter` with `event.isComposing || event.keyCode === 229` so CJK/IME confirmation keystrokes never activate a result prematurely (including Safari's out-of-order `compositionend` edge case).
- **Single Escape owner**: Handle `Escape` exclusively in `App.tsx`'s `onEscape` chain in strict priority order (the search `<input>` must **not** attach its own Escape handler):
  1. `showShortcutsHelp` → close help
  2. `deleteConfirmTask` → close delete confirm (guards against `DeleteConfirmDialog`'s bubble-phase Escape handler, which does not call `stopPropagation`)
  3. `skipOccurrenceTask` → close skip dialog (same bubble-phase guard)
  4. `isTaskModalOpen` → close Quick Add
  5. `isSettingsModalOpen` → close Settings
  6. `isSearchOpen` → if `searchQuery.length > 0`, clear `searchQuery` (keeping focus in the search input); else close Search and restore focus to `moreButtonRef`.
  *(Note: `OverflowMenu` already handles Escape in capture phase with `stopPropagation`, and `MonthYearPickerDialog` is a native `<dialog>`.)*
- **Screen reader feedback**: A single debounced (~350ms) `role="status"` / `aria-live="polite"` region announces result counts (e.g., `"4 tasks found"` or `"No tasks found"`) after typing pauses.
- **Zero schema/sync impact**: No Dexie schema migration (`src/db/db.ts`) and no `tempo_backup.json` sync format changes.

---

## 5. Planned File Changes & Verification

| File | Action | Purpose |
| :--- | :--- | :--- |
| `src/domain/search.ts` | Create | Normalization, multi-token substring matching, recurrence lookahead cache, active/completed classification, date-based sorting, windowed snippet extraction, and match highlight splitting. |
| `src/components/search/TaskSearchView.tsx` | Create | `<search>` header bar, Back/Clear controls, Active + collapsible Completed result groups, `<mark>` highlighting, `ArrowUp`/`ArrowDown`/IME-safe `Enter` navigation, and debounced live announcer. |
| `src/components/menu/OverflowMenu.tsx` | Modify | Add `Search` menu item (`Search` icon + `"Search"`) and `onSearch` callback prop. |
| `src/components/TaskCard.tsx` | Modify | Add optional `notesSnippet` (replacing `showDetails` preview) and `highlightTokens` (`<mark>` rendering), and update Skip button disabled guard to `disabled={!recurring || !onRequestSkipOccurrence}`. |
| `src/hooks/useKeyboardShortcuts.ts` | Modify | Add `onSearch` handler for `/`. |
| `src/App.tsx` | Modify | Add `isSearchOpen`, `searchQuery`, `moreButtonRef`, saved day-list `scrollTop`, unmount calendar subtree while searching + `[calExpanded, isSearchOpen]` touch effect dependency, `handleJumpToDate` (expanding `cal-completed` when needed), single `onEscape` priority chain including `deleteConfirmTask`/`skipOccurrenceTask`, `/` modal guards, `OverflowMenu` `onSearch`, and Shortcuts Help `/` entry. |
| `src/index.css` | Modify | Add `.tt-search-mark` light/dark high-contrast tokens. |
| `src/domain/__tests__/search.test.ts` | Create | Unit tests covering normalization, diacritics, multi-token AND matching, exact/prefix title tie-breaking, date sorting, recurrence lookahead caching, one-off vs active/ended recurring branching, undated/deleted/deprecated fields, and windowed snippets. |
| `src/components/__tests__/taskSearch.test.tsx` | Create | Component & integration tests covering OverflowMenu entry, `/` shortcut & modal guards, IME-safe Enter, arrow-key navigation, tap-to-jump (dated + completed) vs tap-to-edit (undated), in-place complete/swipe on projected tasks, ended recurring disabled checkbox/skip, two-step Escape, focus return to `⋮`, and calendar scroll/touch-listener restoration. |

### Verification (once implemented)
Run via `local_run_and_diagnose` (cwd `~/work/tempo`):
1. `npx vitest run` — all existing and new search tests pass.
2. `npm run build` — `tsc -b && vite build` succeeds cleanly.
3. `npm run lint` — `oxlint` reports zero errors.

---

## 6. Modern Web Guidance Compliance Notes
- **`forms`**: Search `<input type="search">` sized at `16px` (`text-base`) with `enterKeyHint="search"` and text-correction flags disabled (`autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`) to prevent iOS auto-zoom and unwanted autocorrect ("turn off text correction on fields that hold identifiers rather than prose" / "set `font-size` to at least `1rem` (16px) to prevent iOS zoom").
- **`ime-safe-enter-submit`**: Custom `Enter` handling in the search input guards on both `event.isComposing` and `event.keyCode === 229` so CJK/IME confirmation keystrokes never trigger premature result selection on Safari ("By pairing `event.isComposing` with a check for `event.keyCode === 229`, you can reliably catch Safari's out-of-order confirming `Enter` `keydown`.").
- **`highlight-text-ranges`**: Evaluated `CSS.highlights` (`::highlight(task-search)`) from the guide and deliberately chose declarative React `<mark>` spans only (paired with `.tt-search-mark`) so highlighting works uniformly in `happy-dom` tests and avoids stale DOM `Range` cleanup when React re-renders task rows on checkbox completion.
- **`accessibility`**: Uses a semantic `<search>` landmark (not `<form>`), an explicit visually hidden `<label>`, focus restoration to the `⋮` menu button on close, and a debounced `aria-live="polite"` result-count announcer ("Debounce frequently-changing regions: If a region can update many times per second (e.g. a combobox's result count as the user types), debounce so users aren't spammed.").
