# Tempo: TickTick-style Task Manager (PLAN.md)

A cross-platform (Desktop + Mobile PWA) task manager aimed at a credible **TickTick replacement** for personal use: local-first, zero-backend, syncing to Google Drive AppData. Recurring routines remain a first-class strength; one-off tasks, lists, smart lists, and calendar are in scope. **Out of scope for now:** collaboration/shared lists, home-screen widgets, habits module, Pomodoro/focus.

---

## Product decisions (2026-10)

- App is **not in production use** — data model may break freely; no migration compatibility required.
- **No** collaboration, widgets, habits, or Pomodoro.
- Keep Google Drive AppData + IndexedDB local-first architecture.
- Recurrence stays optional and strong (including `after_completion`); it is no longer required on every task.

---

## 1. Architecture (unchanged foundation)

- **Zero-Backend / Client-Only**: Static Progressive Web App (PWA). No server database.
- **Data Privacy & Ownership**: User data in Google Drive hidden application folder (`drive.appdata` scope).
- **Offline**: Local-first via **IndexedDB (Dexie.js)**.
- **Sync**: On startup, user action, and periodic background check. GIS OAuth + single sync file `tempo_backup.json` in `appDataFolder`. Item-level merge (LWW on attrs/tombstones; **set union** on completion history); Drive `ETag` / `If-Match` with retry on 412.

---

## 2. Target data model (Phase 0)

Replace required-recurrence `PeriodicTask` with a general task model. Sketch (evolve in code as needed):

```typescript
export type RecurrenceType =
  | 'after_completion' // next due = completion + interval
  | 'fixed_interval';  // next due = previous due + interval / rule

export interface RecurrenceRule {
  type: RecurrenceType;
  intervalValue: number;
  intervalUnit: 'days' | 'weeks' | 'months';
  // Phase 2+: weekdays, monthly-by-date, end on date/count
}

export interface Task {
  id: string;                  // UUID v4
  title: string;
  notes?: string;
  listId: string;              // Inbox or user list
  dueAt?: string | null;       // ISO date or datetime; optional
  priority?: 'high' | 'medium' | 'low' | 'none';
  pinned?: boolean;
  tags?: string[];
  subtasks?: { id: string; title: string; completed: boolean }[];
  recurrence?: RecurrenceRule | null; // optional — one-off when null
  completedAt?: number | null;
  completionHistory: number[]; // epoch ms
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface TaskList {
  id: string;
  name: string;
  folderId?: string | null;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}
```

Merge rules stay item-level LWW + completion-history union; extend the same pattern to lists/folders.

---

## 3. Technical stack

- Vite + React 19 + TypeScript
- Tailwind CSS + Lucide Icons
- Dexie.js (IndexedDB)
- Google Identity Services + Drive REST API v3 (`drive.appdata`)
- `vite-plugin-pwa` / Workbox
- Vitest (recurrence, merge, filters)

---

## 4. Implementation roadmap

### Phase 0 — Model reset (foundation)

- [x] Replace `PeriodicTask` (required recurrence) with general **Task** + optional `recurrence`
- [x] **Lists** model: built-in **Inbox** + user-created lists
- [x] Update Dexie schema, repositories, seed data, merge/sync payload shape
- [x] CRUD UI: create one-off *or* recurring tasks; assign to Inbox or a list
- [x] No backward-compat migration required (app not in use)

*Done when:* one-off and recurring tasks both work; nothing forces recurrence.

### Phase 1 — Daily driver core

- [x] Due **date/time** (not date-only only)
- [x] Smart lists: **Today**, **Tomorrow**, **Next 7 Days**, **Inbox**
- [x] Reminders / Web Notifications for due tasks (closes former Phase 5 notifications gap)
- [x] Priorities + pin
- [x] Keep/improve search + tag filter pills
- [x] Urgency still useful for recurring items (overdue / due today / upcoming)

*Done when:* you can live in **Today** for a week without missing due work.

### Phase 2 — Structure & depth

- [x] Subtasks / check items
- [x] Folders (group lists)
- [x] Richer recurrence: weekdays, monthly-by-date, end on date/count; keep `after_completion`
- [x] Sections inside a list — optional if subtasks cover enough *(skipped: subtasks cover multi-step projects)*

*Done when:* a multi-step project and an “every weekday” chore both feel natural.

### Phase 3 — Shell & calendar

- [x] Layout: sidebar (smart lists + folders/lists) → main task list → detail pane
- [x] Calendar views: **month** + **agenda**
- [x] Keyboard shortcuts for capture and navigation
- [x] Responsive desktop + mobile; retire single-column “routines feed” as the only shell

*Done when:* the app reads as a TickTick-like shell, not a single routine feed.

### Phase 4 — Power find & board

- [x] Saved filters (AND/OR on tags / priority / due / list)
- [x] Kanban / board by status or list
- [x] Quick capture: global shortcut and/or PWA share; light NLP for due dates

*Done when:* power users can filter and board without leaving Tempo.

### Phase 5 — Sync & polish

- [ ] Background / startup Drive sync polish (feel invisible)
- [ ] Notification reliability
- [ ] Custom SVG/PNG app icons + PWA install polish
- [ ] Optional import from TickTick / CSV
- [ ] Stats only if clearly useful

*Done when:* sync is invisible and alerts are trustworthy.

---

## 5. Explicitly out of scope (for now)

- Collaboration / shared lists
- Home-screen widgets
- Habits module (routines/recurrence cover maintenance-style needs)
- Pomodoro / focus timer
- Eisenhower Matrix, Timeline/Gantt
- Google Calendar bi-directional sync
- Attachments, templates, Won’t Do
- Location / email reminders

Revisit only if product direction changes.

---

## 6. Suggested build order

**0 → 1 → 2 → 3 → 4 → 5**

- **0 before 1:** daily smart lists need optional due dates and non-forced recurrence.
- **2 before 3:** new shell should show real structure (lists/folders/subtasks), not empty chrome.
- **4 after 3:** board/filters belong on the list+detail shell, not the old single feed.
- **5 last:** don’t polish sync/notifications around a moving schema.

---

## 7. Prior completed work (archive)

Already shipped under the routines-first plan:

- [x] Architecture & Drive AppData decision
- [x] Vite + React + TypeScript + Tailwind scaffold
- [x] Recurrence engine + urgency buckets + unit tests
- [x] Merge/conflict engine + unit tests
- [x] Dexie CRUD, completion → next due, soft delete
- [x] Due & Overdue / Upcoming / All Routines views, tags, search
- [x] GIS OAuth + Drive sync + Settings + JSON import/export
- [x] PWA plugin / service worker baseline

Phase 0 intentionally **supersedes** the old required-`PeriodicTask` model.
