# Tempo: Architectural Performance Optimization Plan

## Executive Summary

Tempo is designed as a local-first, zero-backend Progressive Web App (PWA) managing routines and periodic chores. While its data architecture (Dexie.js + IndexedDB + Google Drive backup) is simple and offline-ready, the user experience occasionally exhibits noticeable lag, stutter, and input hitching.

Profiling and source code analysis reveal that the lag is **not** caused by network bottlenecks or heavy external dependencies. Rather, it stems from **6 architectural and implementation flaws**:
1. High-frequency 60Hz/120Hz gesture events (`touchmove`/`pointermove`) driving React component re-renders.
2. A listener teardown/re-registration bug on every single swipe frame in `TaskCard`.
3. Elevation of transient swipe UI state to the application root (`App.tsx`), triggering full-tree re-renders on swipe.
4. An unindexed `useLiveQuery(() => db.tasks.toArray(), [])` loading and cloning 100% of all tasks across the entire database on every mutation.
5. Inefficient, un-cached recurrence calculations checking 126 calendar cells against all recurring tasks on each render.
6. Synchronous, blocking `localStorage` read/parse/stringify operations embedded directly in task interaction handlers (`recordDiagEvent`).

This document details the architectural root causes and provides an actionable, 4-phase remediation plan to achieve consistent 60–120 FPS interactions and instantaneous task updates.

---

## Architectural Root Causes

### 1. High-Frequency Gestures Driving Full React Render Cycles
- **Location**: `src/components/TaskCard.tsx` (lines 175–196, 245–255), `src/components/CalendarMonthView.tsx` (lines 222–241, 285–308)
- **Problem**:
  - In `TaskCard.tsx`, during touch and pointer moves, `setSwipeOffset(next)` updates component state on every frame.
  - **Critical Bug**: `swipeOffset` is included in the `useEffect` dependency array (line 231). As a result, on **every touchmove frame** (60–120 times per second), React unbinds and re-registers the 4 DOM touch listeners (`touchstart`, `touchmove`, `touchend`, `touchcancel`).
  - In `CalendarMonthView.tsx`, dragging between months updates `setDragOffset(dx)` in React state on every frame. Each frame triggers React to reconcile and re-render **126 day cells** across 3 full month grids (previous, current, next month).

### 2. Elevated UI State & Missing Component Memoization
- **Location**: `src/App.tsx` (lines 119, 440–470), `src/components/TaskCard.tsx`
- **Problem**:
  - `TaskCard` is not wrapped in `React.memo`. Any re-render of a parent list re-renders every task card in the DOM.
  - Swiping a card open or closed calls `onSwipeChange={(open) => setSwipedTaskId(open ? t.id : null)}`. Because `swipedTaskId` is state in `App.tsx`, swiping open a single card forces the root `App` component, headers, calendar views, and all other cards across all task groups to re-render.
  - In `App.tsx`, `renderTaskRows` recreates 10+ inline callback closures per card on every render pass, invalidating prop equality even if memoization were partially applied.

### 3. Database Ingestion via `db.tasks.toArray()` on Every Mutation
- **Location**: `src/App.tsx` (lines 151–162)
- **Problem**:
  - `const liveTasks = useLiveQuery(() => db.tasks.toArray(), []);` listens to all mutations on the `tasks` table.
  - Whenever a task is marked complete, uncompleted, reordered, or edited, Dexie fetches the entire table from IndexedDB into memory, including soft-deleted tombstones and historical tasks.
  - `allTasks` and `activeTasks` arrays are completely re-created, triggering downstream memo re-evaluations across `displayedTasks`, `calCompletedTasks`, and `calOverdueTasks`.

### 4. Recurrence Calculation Hotspots in Calendar Month View
- **Location**: `src/components/CalendarMonthView.tsx` (lines 106–128), `src/domain/recurrence.ts` (`taskOccursOnDate`)
- **Problem**:
  - To render calendar indicator dots, `CalendarMonthView` runs:
    ```typescript
    for (const grid of [prevCells, currentCells, nextCells]) {
      for (const cell of grid) {
        if (!set.has(cell.dateStr) && recurringTasks.some((t) => taskOccursOnDate(t, cell.dateStr))) {
          set.add(cell.dateStr);
        }
      }
    }
    ```
  - For 3 grids (126 days), it evaluates `recurringTasks.some(...)`. With 40 recurring tasks, this executes up to **5,000+ un-cached date calculations** on every task mutation or date change.
  - `taskOccursOnDate` parses dates, iterates through completion timestamps, formats strings, and checks recurrence intervals on every invocation.

### 5. Synchronous Storage I/O in User-Action Critical Paths
- **Location**: `src/domain/diagnostics.ts` (lines 46–100), `src/db/db.ts` (lines 244, 269, 287, 318, 336)
- **Problem**:
  - On every task completion, uncompletion, reorder, and deletion, `recordDiagEvent` is invoked synchronously.
  - `recordDiagEvent` synchronously calls `localStorage.getItem`, `sessionStorage.getItem`, `JSON.parse`, merges and sorts an event array, calls `JSON.stringify`, and writes back to `localStorage.setItem`.
  - In mobile browsers (especially WebKit/Blink under PWA mode), synchronous storage access blocks the main JavaScript thread, directly causing touch and tap latency.

### 6. Non-Passive Touch Listeners & Scroll Hitching
- **Location**: `src/components/TaskCard.tsx` (lines 191, 221)
- **Problem**:
  - `el.addEventListener('touchmove', handleTouchMove, { passive: false })` is registered on every card.
  - Calling `e.preventDefault()` inside non-passive listeners disables the browser compositor's ability to scroll smoothly without waiting on the main thread, producing scroll hitching on mobile devices.

---

## Phased Remediation Plan

### Phase 1: Decouple Gestures from React State (Target: Immediate 60–120 FPS)

#### 1.1 Direct DOM Gesture Updates in `TaskCard.tsx`
- **Objective**: Eliminate React re-renders during active drag/swipe gestures.
- **Actions**:
  - Maintain gesture coordinates in refs (`currentOffsetRef`, `touchStartRef`).
  - During `touchmove` and `pointermove`, manipulate `slidingRef.current.style.transform = \`translateX(${offset}px)\`` directly.
  - Fix the `useEffect` dependency array: remove `swipeOffset` so touch listeners are bound only once per card mount.
  - Only update React state (`isOpen`, `swipeOffset`) at the conclusion of the gesture (`touchend` / `pointerup`).
  - Use CSS transitions for snapping open or shut, toggled off only during active gesture manipulation.

#### 1.2 Offload Month Swipes in `CalendarMonthView.tsx`
- **Objective**: Keep month-swipe dragging smooth without reconciling 126 cells per subpixel move.
- **Actions**:
  - Update grid translate offset directly on the container DOM element via `style.transform` and `requestAnimationFrame`.
  - Only commit state changes (`setCalMonth`, `setCalYear`) when snapping to a new month on gesture end.

#### 1.3 Fix Passive Touch Behavior
- **Objective**: Prevent scroll thread blocking.
- **Actions**:
  - Only intercept horizontal swipes (`e.cancelable && e.preventDefault()`) once a gesture is definitively identified as horizontal (> 8px horizontal, > 1.5x vertical).
  - Keep vertical scroll gestures passive.

---

### Phase 2: Component Memoization & Render Hierarchy Isolation

#### 2.1 Localize Swipe Drawer State
- **Objective**: Avoid re-rendering the whole application when a single card is swiped open.
- **Actions**:
  - Move the swipe open state down into each `TaskCard`.
  - For auto-closing previous cards when a new card is swiped, use a lightweight module-level subscriber or event target (`swipeCoordinator`) rather than elevating `swipedTaskId` to root `App` state.

#### 2.2 Memoize `TaskCard`
- **Objective**: Ensure cards only re-render when their own task properties change.
- **Actions**:
  - Wrap `TaskCard` in `React.memo` with a custom comparator or stabilized props.
  - In `App.tsx`, convert inline callbacks (`handleComplete`, `handleEdit`, etc.) to stable handlers or pass task IDs so functions aren't re-instantiated inside `renderTaskRows`.

---

### Phase 3: Asynchronous Diagnostics & Non-Blocking Storage

#### 3.1 In-Memory Buffer for Diagnostics
- **Objective**: Remove disk and JSON operations from the tap/click hot path.
- **Actions**:
  - In `src/domain/diagnostics.ts`, maintain recent events in a fast, in-memory array buffer.
  - Flush events to `localStorage` using a debounced timer (e.g. 1000ms delay) or `requestIdleCallback`.
  - Eliminate repetitive synchronous reads of `localStorage` and `sessionStorage` on every single event.

---

### Phase 4: Recurrence & Query Optimization

#### 4.1 Caching Calendar Dot Computations
- **Objective**: Reduce 5,000+ recurrence evaluations per render to a single fast lookup.
- **Actions**:
  - Compute a `Map<string, boolean>` or `Set<string>` of occurrence dates for active recurring tasks only within the visible 3-month window.
  - Cache recurrence calculations by task `id` and `updatedAt`.
  - In `CalendarMonthView`, check the pre-computed set in O(1) instead of running `recurringTasks.some(...)` per cell.

#### 4.2 Query Refinement in `db.tasks`
- **Objective**: Avoid loading soft-deleted tasks into memory on every mutation.
- **Actions**:
  - Use Dexie indexed queries or index filters to separate active tasks from soft-deleted tombstones and completed archive records.
  - Avoid unnecessary full-array allocations when individual tasks change.

---

## Verification & Benchmarking Strategy

Following project guidelines, all verification will be executed via the local RTX 5070 Ti subagent tool `local_run_and_diagnose(command, cwd="~/work/tempo")`:

1. **Unit Test Verification**:
   - `npx vitest run` to ensure all existing recurrence, calendar, and swipe tests pass without regression.
2. **Build Verification**:
   - `npm run build` (`tsc -b && vite build`) to ensure zero TypeScript errors (`verbatimModuleSyntax`) and clean bundling.
3. **Lint Verification**:
   - `npm run lint` to enforce formatting and import standards.
4. **Interactive Verification**:
   - Measure frame consistency and responsiveness using browser DevTools Performance profiler during card swipes, calendar paging, and rapid task completion toggles.
