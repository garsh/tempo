# Tempo: Security Review Plan

Status: **implemented 2026-11-18.**
Reviewed: 2026-11-18. The review notes at the bottom are part of the implementation. The production Content-Security-Policy also includes `frame-src https://accounts.google.com`, because silent Google sign-in uses a hidden iframe. Without that, item A would fail under the new policy.

This is a local-first PWA. There is no backend. Tasks live in IndexedDB and in a private Google Drive appData file (`tempo_backup.json`). The OAuth scope is `drive.appdata` only (this app's folder, not the rest of Drive). That scope choice is the right one.

The review did not find a script-injection bug in the current UI. Task titles and notes are rendered as React text. There is no `dangerouslySetInnerHTML`, `eval`, or `document.write`. `.env` is gitignored and holds only the public OAuth client id. External links use `rel="noreferrer"`. Preferences are passed through `sanitizePrefs` before use.

The issues below are still worth fixing. One cross-site scripting bug, or one malicious backup, currently has a larger blast radius than it needs to.

Letters are the implementation units. Each status is `implemented`. Complexity is how likely the fix was to introduce a new bug.

---

## A. Drive access token is stored in `sessionStorage`

**Status:** implemented
**Complexity:** Medium. A bad silent-refresh path will either pop the Google prompt on every reload or stop background sync.

**Where:** `src/sync/googleAuth.ts` (`storeAccessToken`, `getCachedAccessToken`, `TOKEN_KEY`). Callers: `src/sync/autoSync.ts`, `src/components/settings/SettingsPage.tsx`.

**What is wrong:** The Drive access token is written to `sessionStorage` for up to about an hour. Any script that can run on `https://tempo.bot.nu` can read it and then download or replace `tempo_backup.json`. The app has no Content-Security-Policy (item C), so nothing else limits that script. Keeping the token in `localStorage` would be worse. An HttpOnly cookie is not available: there is no backend to set one.

**User scenario:** A bad browser extension, or a script bug we do not have today, runs on the Tempo tab. Within the hour, that script can copy the backup (task names, notes, completion history) or upload a replacement that the next sync merges in.

**Fix:**

- Keep the token in a module-level variable in `googleAuth.ts`. Do not write it to `sessionStorage` or `localStorage`.
- On load, call the existing silent Google Identity Services refresh (`prompt: ''`) in `ensureGoogleAccessToken`. Interactive prompt only when the user presses Sign in.
- Clear the in-memory token on sign-out (item B) and when Google returns an error.
- Keep the expiry skew. Do not log the token or put it in `recordDiagEvent` / `recordSyncError`.

**Check:** Reload the open app and confirm background sync still runs without a consent popup. Confirm DevTools Application storage has no `tempo_google_access_token`. Confirm Sign in still works when the silent refresh fails.

---

## B. Sign out does not revoke the token, and other tabs keep working

**Status:** implemented
**Complexity:** Low. Revoke can fail offline or because of CORS. Sign-out must still finish locally.

**Where:** `handleSignOut` in `src/components/settings/SettingsPage.tsx` (about line 311). It calls `clearStoredToken()` and `setGoogleAccount(null)` only.

**What is wrong:** Sign out forgets the token in this tab. Google keeps accepting that token until it expires. `sessionStorage` is per tab, so another open Tempo tab still has its own copy and will keep syncing. There is no `BroadcastChannel` (or `storage` event) to tell those tabs to stop.

**User scenario:** On a shared computer you tap "Sign out on this device" and leave. Another Tempo tab, or anyone who already copied the token, can still read and write the Drive backup until the token expires (about an hour).

**Fix:**

- Read the current token, then drop it from memory (and from `sessionStorage` if A is not done yet).
- Best-effort revoke, and do not block the UI on it:

  `POST https://oauth2.googleapis.com/revoke` with body `token=...` and `Content-Type: application/x-www-form-urlencoded`.

  If the browser hides the response (CORS), send it as a simple POST anyway. Ignore failure. Always clear the local session.
- Broadcast `tempo-auth-signout` on a `BroadcastChannel`. Other tabs clear the token, clear the cached Google account, and skip the next sync.
- Leave local tasks in IndexedDB. The button already says they are kept. Do not add a wipe unless the user asks for one.
- Add `https://oauth2.googleapis.com` to `connect-src` when C lands.

**Check:** Sign out in one tab. The other tab should drop the account and stop syncing. A follow-up Drive call with the old token should get 401 after revoke (skip this assertion if the network blocked the revoke call).

---

## C. Production responses have no security headers

**Status:** implemented
**Complexity:** Medium. A tight Content-Security-Policy can break Google sign-in, the avatar image, or the theme boot script. Vite dev (HMR, eval) must not use this policy.

**Where:**

- Production: `tempo.bot.nu` block in `/home/bgarcia/work/ourmaps/Caddyfile` (outside this repo). Today it sets cache headers only.
- App: inline script in `index.html` (lines 19–25) that applies the theme before first paint. No CSP meta tag exists, which is correct for dev.

**What is wrong:** Without a script policy, any injected HTML can load code from anywhere and read IndexedDB plus the Drive token. Without `frame-ancestors`, another site can embed Tempo and trick clicks (sign-in, delete, sync). Shared-note URLs can also leak through the `Referer` header (item D). `X-Content-Type-Options` and HSTS are missing.

**User scenario:** A page you did not mean to trust loads Tempo in a hidden frame, or an injected script reads every task and the Drive token and sends them off-site. Nothing in the current response headers stops either case.

**Fix:**

- Move the theme boot snippet to `public/theme-init.js` and load it with a normal blocking `<script src="/theme-init.js">` (no `async` / `defer`) so the first paint still has the right theme. Keep the allowlist: only `light` and `dark` may set `documentElement.dataset.theme`.
- On the Caddy site only, send:

  - `Content-Security-Policy` roughly:
    - `default-src 'self'`
    - `script-src 'self' https://accounts.google.com`
    - `connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com`
    - `img-src 'self' data: https://*.googleusercontent.com https://*.ggpht.com`
    - `style-src 'self' 'unsafe-inline'` (Tailwind utility `style` attributes)
    - `base-uri 'self'`
    - `object-src 'none'`
    - `frame-ancestors 'self'`
    - `form-action 'self'`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security` with a long max-age, after one confirmed HTTPS deploy

- Do not add this CSP as a meta tag in `index.html`. It would break `npm run dev`.

**Check:** Production (or a Caddy replay): Sign in, sync, avatar image, theme toggle with no flash, PWA refresh. Confirm the Google script loads and that a test iframe from another origin is refused. Confirm `npm run dev` still hot-reloads.

---

## D. Share Target puts private text in the URL

**Status:** implemented
**Complexity:** Medium. Share-into-Tempo is easy to break. Dev mode unregisters the service worker, so this path only works in a production build.

**Where:**

- `vite.config.ts` manifest `share_target` (GET, `title` / `text` / `url` query params).
- `src/App.tsx` lines 154–167. The effect copies those params into the new-task title, then `replaceState` strips them.

**What is wrong:** The share is a GET. The private title, text, and URL are on the request line before the app can delete them. Caddy can log them. The Google script in `index.html` is loaded at the same time, so `accounts.google.com` can receive them in `Referer`. `replaceState` only fixes the address bar afterward. There is also no length cap, so a very long query string becomes the task title and can stall the tab.

The shared string is not executed as HTML. This is a privacy and availability bug, not script injection.

**User scenario:** From another app you share a private note into Tempo. The note is in the address bar and can be stored in the site's access log and sent to Google with the sign-in script request.

**Fix:**

- Change `share_target` to `POST` `action: '/share'` with `application/x-www-form-urlencoded` (or `multipart/form-data`).
- In `public/sw-notify.js` (already imported by Workbox), handle only `POST /share`: read the form body, store a length-capped payload (suggest 2_000 characters total) in the Cache API or IndexedDB, then respond with a redirect to `/?share=1` and no note text.
- `App.tsx` reads that stash, opens the new-task sheet, and deletes the stash. Ignore `title` / `text` / `url` query params, or accept them only when each value is under the same cap and no service worker ran.
- Item C's `Referrer-Policy` is extra cover. It does not replace POST. The server still sees a GET query string.

**Check:** Install the production build. Share text from the OS share sheet. The Tempo URL must not contain the note. The new-task sheet must show the note. A multi-megabyte share must be truncated or refused without freezing the page. Normal navigation must still load the app.

---

## E. Imported and Drive backups are trusted without a schema or size limit

**Status:** implemented
**Complexity:** Medium. Rejecting a whole backup because one field is odd can look like data loss. Clamping `updatedAt` carelessly can mark every task dirty and re-upload the world on each sync.

**Where:**

- `downloadDriveBackup` and `mergeRemoteIntoLocal` in `src/sync/googleDrive.ts` (`JSON.parse`, then `mergeTasks` / `mergeLists` / `mergeFolders`, then `bulkPut`).
- `importJsonBackup` in `src/components/settings/dataTransfer.ts`.
- `mergeTasks` in `src/domain/merge.ts` unions `completionHistory` and `skippedDates` with no cap. CSV import already caps history at 365 (`mergeHistories` in `dataTransfer.ts`). Drive sync does not.

**What is wrong:** Both paths parse the whole payload with `res.text()` / `FileReader` and then merge it. `JSON.parse` itself does not pollute `Object.prototype` here, and Dexie will not run script from a field. The damage is integrity and availability:

- `updatedAt` far in the future wins last-write-wins forever, so later edits on this device never stick. Auto-sync then uploads that copy to Drive and other devices.
- `deletedAt` tombstones tasks.
- A multi-megabyte file, or a huge `completionHistory`, freezes the tab on every sync.
- Objects are spread straight into IndexedDB, so unexpected shapes get stored.

A stolen Drive token or a JSON file from someone else is enough. The user does not have to be tricked into running a script.

**User scenario:** You import a JSON file someone sent as a "template", or someone who can write your appData file does so. Those tasks always beat yours after that, including edits you make next week. Or the file is large enough that Tempo locks up on the next sync.

**Fix:** One `parseSyncPayload(text, { maxBytes })` used by import and by Drive download.

- Refuse the body above a fixed size before `JSON.parse` (suggest 5 MB). If `Content-Length` is missing, stop reading once the cap is hit.
- Rebuild each task, list, and folder field by field. Do not spread the raw object.
- Require string `id`s of a bounded length. Drop records that fail. Do not fail the whole sync for one bad record.
- Cap `title`, `notes`, and `name`. Cap `completionHistory` and `skippedDates` (365, same as CSV import). Cap how many records a payload may contain.
- Clamp `createdAt`, `updatedAt`, and `deletedAt` to `Date.now()` plus a few minutes of skew. Use the clamped value only when the stored value is actually out of range, so a normal sync does not rewrite every row.
- Keep last-write-wins and completion-history union after the records are clean.
- Show a normal error if an import file is empty, too large, or has no valid tasks.

**Check:** A backup with `updatedAt` in year 2099 must not beat a local edit made after import. A second sync must not upload every task again. A file over the size cap must not write to IndexedDB. A payload with one garbage row and one good row must keep the good row. Existing tests in `src/domain/__tests__/merge.test.ts` must still pass, with new cases for the clamp and the caps.

---

## F. Two Drive backup files can split the sync

**Status:** implemented
**Complexity:** Low if the client only pins a file id. High if it deletes "extra" files. Do not delete files in this change.

**Where:** `getOrCreateAppDataFile` in `src/sync/googleDrive.ts` (lines 30–66). It uses `files[0]` with no `orderBy`. The id is placed in the URL with no encoding: `` `/files/${fileId}` ``.

**What is wrong:** Two clients can create `tempo_backup.json` at the same time. Drive's list order is not stable, so later syncs can read different files. Edits then look lost. A file id containing `?` or `/` would also change the request path. Those ids come from Google's response, so this is belt-and-suspenders, not a live cross-site bug.

**User scenario:** You add a task on your phone and it never shows up on the laptop, or it appears and later vanishes. Both devices are "synced". They are writing two different backup files.

**Fix:**

- Request `orderBy=modifiedTime desc` and a page size.
- Remember the chosen file id in `localStorage` and keep using it when it still exists.
- If several files match and none is remembered, use the newest and leave the others in place. Deleting them is a follow-up, not part of this fix.
- Accept only ids matching `^[A-Za-z0-9_-]+$`, and `encodeURIComponent` the id in the path.

**Check:** With two appData files of the same name, two syncs in a row must hit the same id. A file id with `?` or `/` must be ignored, not requested.

---

## G. Notification click will open whatever URL is in the payload

**Status:** implemented
**Complexity:** Low. Nothing in the app shows notifications today (the feature-removal plan removed them). This is shipped service-worker code, so it should still be tight.

**Where:** `public/sw-notify.js`. `clients.openWindow(target)` uses `event.notification.data.url` or `'/'`. `vite.config.ts` imports this script into the production worker.

**What is wrong:** Chrome will open a non-Tempo URL from a notification click. Any same-origin caller of `showNotification`, including a future reminder bug, can set that URL.

**User scenario:** You tap a Tempo notification and the browser opens a different site.

**Fix:** Allow only a same-origin path (`/` plus a relative URL). Ignore absolute URLs and `//host` URLs. Default to `/`.

**Check:** A unit or worker test: `https://evil.example/` and `//evil.example/` do not get passed to `openWindow`. `/` and `/?share=1` do.

---

## H. Dev server allows every `*.lan` host

**Status:** implemented
**Complexity:** Low. A hostname other than `bird.lan` would stop working until it is added.

**Where:** `vite.config.ts` `server.allowedHosts: ['bird.lan', '.lan']` and `host: true` (port 5180).

**What is wrong:** This is development only. `host: true` is intentional so the LAN can load the app. The leading-dot `.lan` rule accepts any Host that ends in `.lan`. Vite's host check exists to stop DNS-rebinding requests against the dev server. The rule is wider than this project uses (`bird.lan`, from `AGENTS.md`). Leave `server.fs.strict` at its default (`true`) so the dev server does not serve files outside the project.

**User scenario:** Another machine on the network, or a rebinding name under `.lan`, can talk to your Vite dev server as if it were an allowed host.

**Fix:** Set `allowedHosts` to `['bird.lan']` only. Localhost stays allowed by Vite's default.

**Check:** `http://bird.lan:5180` and `http://localhost:5180` still load. A different `*.lan` host is rejected.

---

## I. Account avatar URL is taken from storage as-is

**Status:** implemented
**Complexity:** Low. A Google host rename would hide avatars until the allowlist is updated. The placeholder already exists.

**Where:** `fetchDriveAccount` in `src/sync/googleAccount.ts` stores `photoLink`. `Avatar` in `src/components/settings/settingsUi.tsx` sets `<img src={account.photoUrl}>`. `referrerPolicy="no-referrer"` is already set, which is good.

**What is wrong:** The cached account object lives in `localStorage` (`tempo_google_account`). The image loader will request whatever URL is in `photoUrl`, including a tracker or a huge `data:` URL. Google's real links are on `googleusercontent.com` / `ggpht.com`.

**User scenario:** Something that can write this site's `localStorage` points your avatar at another server. Opening Settings sends that server a request from your browser.

**Fix:** Before rendering or saving, allow only `https` URLs whose host is `googleusercontent.com` or a subdomain, or `ggpht.com` or a subdomain. Otherwise drop `photoUrl` and show the placeholder.

**Check:** A normal sign-in still shows the Google photo. A `photoUrl` of `https://example.com/a.png` or `javascript:alert(1)` shows the placeholder and does not request `example.com`.

---

## J. Custom OAuth client id is not checked

**Status:** implemented
**Complexity:** Low. A too-strict pattern could reject a valid client id. Check the suffix only.

**Where:** `setStoredClientId` in `src/sync/googleAuth.ts`. The Advanced settings field in `SettingsPage.tsx` (about lines 385–457) saves any string and prefers it over `VITE_GOOGLE_CLIENT_ID`.

**What is wrong:** The built-in client id is public. That is normal for a browser OAuth client. The risk is the override: any string is stored in `localStorage` and used as `client_id`. Someone can be talked into pasting a different Google client id. Google will show that app's name on the consent screen. Tempo still receives the token in the browser (it does not post the token to the other developer), but the user may believe they authorized Tempo.

**User scenario:** A message says to paste a client id into Advanced settings to "fix sync". You approve Google's prompt. The prompt is for someone else's app, and Tempo starts syncing with that client.

**Fix:**

- Save an override only when it ends with `.apps.googleusercontent.com`, has no whitespace, and is a reasonable length. Otherwise show the existing error status and keep the previous id.
- When an override is active, show a short line on the account card: "Using a custom OAuth client on this device."
- Do not treat the built-in `VITE_GOOGLE_CLIENT_ID` as a secret. Do confirm in Google Cloud Console that this client is a Web client and that Authorized JavaScript origins are only `https://tempo.bot.nu` and `http://localhost:5180`.

**Check:** Pasting `not-a-client` does not change the stored id. Pasting a well-formed `….apps.googleusercontent.com` id still saves, and the account card shows that it is custom.

---

## Suggested order

Implemented in this order:

1. **A** and **B** together. They are the token lifetime.
2. **E**. Stops a bad backup from sticking.
3. **C** and **D**. Headers, then share POST, so the policy and the new Google revoke host land together.
4. **F**, **G**, **I**, **J**, **H**. Smaller hardening. H is dev-only.

## Out of scope

- Encrypting IndexedDB. Sign-out deliberately keeps tasks on the device.
- Adding a backend so the token can be an HttpOnly cookie.
- `npm audit` of dependencies. Not run in this review.
- Prototype-pollution hardening beyond item E's "rebuild records field by field". `JSON.parse` plus object spread is not a working prototype-pollution bug in this code.

## Review Notes & Implementation Nuances

Additional notes and edge-case guidance from the review on 2026-11-18:

- **Item A & B (OAuth Token Lifecycle & Offline PWA UX):**
  - Moving the token from `sessionStorage` into an in-memory variable in `googleAuth.ts` means page reloads will invoke silent GIS refresh (`prompt: ''`). When the PWA is loaded offline, this silent network refresh will fail. The app must treat this failure as "offline / sync paused" rather than immediately dropping the cached account information or prompting for re-authentication. Silent refresh should retry once connectivity is restored.
  - For token revocation on sign-out, Google Identity Services exposes `google.accounts.oauth2.revoke(token, doneCallback)`. If the GIS SDK is loaded on `window`, use that native method first before falling back to manual HTTP POST requests to `https://oauth2.googleapis.com/revoke` (which avoids browser CORS mode edge cases).
- **Item C (CSP & Environment Boundaries):**
  - The CSP must strictly remain in Caddy (`/home/bgarcia/work/ourmaps/Caddyfile`) and not be added as a `<meta>` tag in `index.html`. A `<meta>` CSP would break Vite's development HMR and inline development scripts during `npm run dev`.
  - Ensure `public/theme-init.js` is loaded as a synchronous blocking script (`<script src="/theme-init.js"></script>` without `async` or `defer`) to prevent a theme flash-of-unstyled-content (FOUC).
- **Item D (Web Share Target Implementation Details):**
  - Transitioning the Web Share Target to `POST /share` requires configuring the service worker (`public/sw-notify.js`) to intercept `fetch` events targeting `/share`. The service worker should extract the form data, stash it in an ephemeral Cache API entry or IndexedDB table, and return a 303/302 redirect to `/?share=1`. `App.tsx` can then retrieve and clear that payload upon mounting.
- **Item E (Backup Payload Validation & Defensive Boundary):**
  - Currently `mergeEntities` in `src/domain/merge.ts` spreads raw objects (`...remote`) into IndexedDB. Implementing `parseSyncPayload(text, { maxBytes })` is a critical defense-in-depth boundary against both oversized payloads and future-dated `updatedAt` timestamps that would permanently lock out Last-Write-Wins updates.
- **Item F (Drive File Pinning):**
  - Pinning the chosen Drive `fileId` in `localStorage` and sorting by `modifiedTime desc` is essential because Drive's `appDataFolder` can contain multiple files named `tempo_backup.json` if created concurrently across devices. Validating the file ID format with `^[A-Za-z0-9_-]+$` protects against path or parameter injection.

