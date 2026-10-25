# iPad handwriting reliability fix

Implemented 2026-10-25 after reports that Apple Pencil stopped writing after a second or two and required repeated attempts to resume. These changes address weaknesses found in the input handler; the exact device-specific trigger has not been reproduced on an iPad.

## Changes

- Stroke completion is idempotent. Pointer up, cancellation and lost capture preserve the partial stroke and unlock writing without saving it twice.
- Window-level move/up/cancel listeners keep handling input when capture fails or the pointer ends outside the canvas. Capture failure no longer aborts starting a stroke.
- A new primary contact from the same pointer type finalizes any stale stroke, including one on the opposite page. A zero-button hover also releases a missed pen lift. Touch input cannot start, replace or end pen ink.
- Window blur, page hiding and document visibility loss finalize partial ink through the existing save queue. This improves lifecycle handling but cannot guarantee completion of IndexedDB writes during force-close or operating-system termination.
- Resizing and React redraws include the active stroke. Canvas dimensions are reset only when their pixel dimensions actually change.
- Pen movement draws only new segments, including coalesced samples, instead of clearing and replaying all page ink on every movement. Full redraws remain for completion, resize, changed saved ink and eraser hits. Erasing still scans existing strokes; this does not remove all large-document performance limits.
- Color, width and eraser mode belong to the stroke that started with them; event listeners use current save callbacks. A pen-up endpoint is retained with the last contact pressure.
- Selection, iOS touch callouts and the context menu are suppressed on the handwriting canvas. The existing `touch-action: none` remains in place; Browse dates remains available.

No storage schema or backup format changes are required. Existing handwriting remains editable. These changes do not implement native-app palm rejection or recover input that iPadOS never delivers to the browser.

## Automated verification

Run `pnpm build`, `pnpm test`, then start a production preview with `pnpm preview --host 127.0.0.1 --port 4173`.

- `pnpm test:browser`: existing mouse input with native capture, navigation locking, undo/redo, erasing, save failure/retry, reload persistence, backup/restore, touch exclusion and offline reload.
- `pnpm test:ink`: synthetic pen cancellation, duplicate endings, missing endings, new contact on either page, lost capture, failed native capture, hover recovery, blur/pagehide/visibility changes, palm exclusion during writing, active-stroke pixels across React updates and resize, coalesced samples, incremental drawing, rapid pen lifts and persisted reload equality.

To target a different preview port in PowerShell, set `$env:PLANNER_TEST_URL='http://127.0.0.1:4175/'` before either browser command. Browser suites use disposable desktop profiles and synthetic planner content. They do not modify the hosted planner or the iPad's database.

## Deployment and iPad acceptance

Deploy the complete rebuilt `dist/` bundle using [the existing hosting and update instructions](running-and-hosting.md). The generated service-worker version changes with the bundle. This source change alone does not update plan.lucdaigle.net.

1. Download and retain a JSON backup from the current iPad installation.
2. Upload the complete new production build, retaining old hashed assets during transition. Open the app online and use **Save and update** when offered. Avoid clearing website data, which removes handwriting.
3. In both Safari and the Home Screen app, write continuously for at least two minutes on each page. Include long strokes, dots, small letters, varying pressure and fast repeated pen lifts.
4. Repeat while resting your palm on each page. Verify no finger ink and no unexpected navigation. Compare once with your palm raised if interruption persists.
5. Rotate or resize during a stroke and verify existing and in-progress ink remain visible and aligned; continue writing afterward.
6. Lift the Pencil off the page, switch apps and return, then write again. Verify navigation unlocks and the partial stroke is retained when lifecycle events are delivered.
7. Check erasing, undo/redo, rapid switching between the two pages, saved reloads and offline reopening after the new assets finish caching.

If the symptom remains, record iPadOS version, Pencil model, Safari versus Home Screen mode, whether the palm was resting, and whether navigation buttons remain disabled after lifting the Pencil. Those details distinguish stale app state from input being withheld by the platform.

## Validation record

### Follow-up: rapid contacts and native selection

The first fix did not resolve real-iPad printing: continuous strokes worked, but repeated pen lifts often stopped input. A user screenshot showed native blue selection handles and the Copy/Look Up menu. This confirms native selection occurred; it does not prove selection was the only cause of missing input.

The follow-up protects the entire book and all descendants with Safari and standard no-selection CSS and disables touch callouts there. While writing, native capture listeners on the book cancel selection-start, context menus, double-click defaults and touch-start defaults on the paper. The touch listener is explicitly non-passive. These listeners do not handle drawing or create duplicate ink; Pointer Events remain the drawing path. Paper selections are cleared on pen contact and selection changes. Selection outside the paper is preserved. Browse dates releases the event guards, and date buttons remain usable.

Pointer up/cancel now rely on the browser's automatic capture release. Delayed lost-capture notifications are ignored when that pointer already has capture again, protecting rapid reuse of the same pen ID. Genuine capture loss still saves partial ink and unlocks writing.

Regression checks cover the selection CSS across all book elements, cancelable selection/touch/menu gestures, clearing injected paper selection, retaining selection outside the planner, repeated contacts with a reused pen ID, simulated stale capture loss, and date navigation after switching to Browse. Synthetic desktop events cannot establish native iPad gesture behavior; retest printing and rapid taps in Safari and the Home Screen app after deploying this follow-up.

The release ZIP is rebuilt from the final `dist` contents, including `.htaccess`, and checked entry-by-entry against that build. Extract it directly into the domain document root. Keep a downloaded handwriting backup and use **Save and update**; do not clear website data.

Production build/type checking and all five unit tests passed. The existing Edge browser suite and new synthetic pen suite passed locally on 2026-10-25. Real-iPad acceptance and deployment remain outstanding.
