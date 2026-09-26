# Tempo: Periodic Todo & Routine Manager (PLAN.md)

A cross-platform (Desktop + Mobile PWA) task manager optimized for recurring items and periodic rhythms, built with a local-first, zero-backend architecture syncing directly to Google Drive.

---

## 1. Architecture Decision: Local-First with Google Drive AppData

- **Zero-Backend / Client-Only**: The application is distributed as a static Progressive Web App (PWA). No server database is maintained; you incur zero hosting/infrastructure cost.
- **Data Privacy & Ownership**: All user data resides in the user's private Google Drive hidden application folder (`drive.appdata` scope).
- **Offline Capability**: Local-first operation via browser **IndexedDB (Dexie.js)**. Tasks can be viewed, created, and checked off with zero network latency or while offline.
- **Sync Engine**:
  - Sync triggers on app startup, user action, and periodic background check.
  - Authenticates via Google Identity Services (GIS) token client requesting `https://www.googleapis.com/auth/drive.appdata`.
  - Reads and updates a single sync file: `tempo_backup.json` inside the hidden `appDataFolder`.

---

## 2. Conflict Resolution Specification

Sync merges are performed at the **item level** with deterministic rules:

### A. Data Model & Metadata
```typescript
export type RecurrenceType = 
  | 'after_completion' // e.g. "Wait 5 days after I finish this before it's due again"
  | 'fixed_interval';  // e.g. "Every Monday" or "Every 3 days regardless of when done"

export interface PeriodicTask {
  id: string;                  // UUID v4
  title: string;
  notes?: string;
  recurrenceType: RecurrenceType;
  intervalValue: number;       // e.g., 5
  intervalUnit: 'days' | 'weeks' | 'months';
  dueDate: string;             // ISO date string (YYYY-MM-DD)
  createdAt: number;           // Unix epoch ms
  updatedAt: number;           // Unix epoch ms (for LWW conflict resolution)
  deletedAt?: number | null;   // Soft-delete tombstone (preserves deletion across devices)
  completionHistory: number[]; // Epoch ms timestamps of every completion
  tags?: string[];
}
```

### B. Merge Algorithm
1. **Remote Fetch**: Download latest `tempo_backup.json` and its Google Drive `ETag`.
2. **Item-by-Item Reconciliation**:
   - **Local Only**: Keep and mark for upload.
   - **Remote Only**: Insert into local IndexedDB.
   - **Conflict (Task exists both locally and remotely)**:
     - **Task Attributes** (`title`, `notes`, `interval`, `dueDate`): Newer `updatedAt` wins.
     - **Tombstones** (`deletedAt`): Whichever has a non-null `deletedAt` with a later or equal timestamp wins.
     - **Completion History** (`completionHistory`): **Set Union** of both timestamp arrays (`Array.from(new Set([...localHistory, ...remoteHistory])).sort()`). This guarantees completions recorded offline on phone and metadata edits made on desktop both survive.
3. **Commit & Push**:
   - Save merged state into local IndexedDB.
   - Upload merged state back to Google Drive with `If-Match: <ETag>`.
   - If `412 Precondition Failed` (another device synced in the interim), retry fetch-and-merge.

---

## 3. Core Product Features

### A. Periodic Recurrence Engine
1. **Completion-Based Recurrence ("Reset Clock on Done")**:
   - *Use cases*: Watering plants, cutting hair, car maintenance, vacuuming.
   - *Logic*: `Next Due Date = Date of Completion + Interval`.
2. **Fixed Interval Recurrence**:
   - *Use cases*: Paying bills, taking weekly trash out, monthly reports.
   - *Logic*: `Next Due Date = Previous Due Date + Interval` (or specific weekdays/dates).
3. **Smart Urgency Buckets**:
   - **Overdue**: Due date < today.
   - **Due Today**: Due date == today.
   - **Upcoming**: Due within next 3 days.
   - **Later**: Beyond 3 days.

### B. Progressive Web App (PWA) Capabilities
- **Desktop & Mobile Responsive**: Single responsive layout built with Tailwind CSS.
- **Installable**: Web App Manifest with icons, standalone display mode, theme color.
- **Offline Service Worker**: Powered by `vite-plugin-pwa` (Workbox) caching all assets and offline fallback.
- **Local Notifications**: Web Notifications API for due task reminders.

---

## 4. Technical Stack

- **Bundler & Framework**: Vite + React 18 / 19 + TypeScript
- **Styling**: Tailwind CSS + Lucide Icons
- **Local Database**: Dexie.js (wrapper around IndexedDB)
- **Authentication & Cloud API**: Google Identity Services (`google.accounts.oauth2`) + Google Drive REST API v3
- **PWA Tooling**: `vite-plugin-pwa`
- **Testing**: Vitest (for conflict resolution & recurrence calculation unit tests)

---

## 5. Implementation Roadmap

### Phase 1: Project Foundation & Domain Logic
- [x] Architecture & storage decision (Option A: Google Drive AppData).
- [x] Scaffold Vite + React + TypeScript + Tailwind CSS project.
- [x] Implement core domain logic:
  - Recurrence engine (`calculateNextDueDate`, urgency status calculation).
  - Conflict resolution merge engine (`mergeTasks`, `resolveTaskConflict`).
  - Unit tests verifying edge cases (offline edits, overlapping completions, tombstones).

### Phase 2: Local-First Task Management (IndexedDB)
- [x] Configure Dexie.js schema and repositories (`TempoDatabase`).
- [x] Build task CRUD and completion actions:
  - Quick-complete (updates completion history and computes next due date).
  - Task creation modal with recurrence presets ("Every N days", "N days after completion", etc.).
  - Task editing and soft-deletion (`deletedAt`).
  - Initial sample routine seeder for quick first-run experience.

### Phase 3: UI & Responsive Views
- [x] Responsive layout optimized for desktop and mobile screens.
- [x] Dashboard views:
  - "Due & Overdue" view (grouped with status badges).
  - "Upcoming" view.
  - "All Routines" view with recurrence badges and cadence summaries.
  - Tag filter pills and instant search.
  - Completion count badge and last completed date indicator.

### Phase 4: Google Drive AppData Sync Integration
- [x] Google Identity Services OAuth token client (`googleAuth.ts`).
- [x] Drive API client for `appDataFolder` (`googleDrive.ts`).
- [x] Conflict resolution merge with Google Drive `ETag` precondition header.
- [x] Settings modal with Google Client ID configuration and sync triggers.
- [x] Offline JSON export and import for data portability.

### Phase 5: PWA, Notifications & Polish
- [x] Configure Web App Manifest, theme colors, and offline service worker via `vite-plugin-pwa`.
- [ ] Custom SVG/PNG app icon generation.
- [ ] Web Notifications API toggle for due routine reminders.
