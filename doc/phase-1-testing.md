# Phase 1 verification

## Automated checks

`pnpm test` covers all 2027 months including six-row layouts, leap/year-boundary arithmetic, JSON round trips and invalid imports, stroke-segment hit testing, IndexedDB round trips and validated replacement.

Run production preview on port 4173, then `pnpm test:browser`. The browser script uses installed Microsoft Edge headlessly and an isolated temporary profile. It tests mouse ink, touch exclusion, undo/redo, reload persistence, date navigation, backup/restore, rejected imports, and offline reload. Screenshots are saved in ignored `test-results/`. The test profile and synthetic ink are not Kim's live planner.

Verified on 2026-10-25: TypeScript/production build passed; all five automated tests passed; Edge browser checks passed including second-tab exclusion, navigation lock during writing, a simulated quota failure followed by successful retry, and whole-stroke erasing. Monthly and weekly screenshots were visually reviewed at 1366 × 1024 and the smaller landscape layout at 1024 × 768. This does not establish real-iPad acceptance.

## Real iPad acceptance checklist

- Install the production build from HTTPS on Kim's 13-inch iPad Pro with Pencil Pro.
- Confirm the pages, six rings, twelve tabs and controls fit landscape comfortably; inspect portrait and any display scaling she uses.
- Write short/long strokes, tiny letters and dots, varying pressure. Check latency, sharpness and alignment across both pages and after resizing.
- Rest a palm while writing. Try touching the other page and controls. Verify no unwanted ink or navigation.
- Verify pen colors/thickness, whole-stroke eraser, undo/redo on both pages, and switching spreads without affecting the wrong page.
- Close/reopen the installed app and confirm handwriting and the last spread return. Never force-close while the app says Saving.
- Finish downloading app assets, close it, enable Airplane Mode, relaunch and write/save again.
- Download a backup to Files. Restore it in a disposable browser profile or after saving a separate safety backup. Confirm all ink and navigation return.
- Verify updating with existing ink and independently retained JSON backup before regular use.
- Check January 1 and December 31 boundary weeks, and a six-row month such as May 2027. Today explicitly offers to open a different year when appropriate.

## Current limits

This is a Phase 1 review build. Page curling/swipes, custom inserts, selection/movement, highlighter/pencil effects, bookmarks and PDF export are not implemented. Weekly layout remains the proposed Sunday-first interpretation of the reference photos. Small reference calendars are deferred. No Pencil Pro squeeze or barrel-roll integration is claimed.

Actual Pencil pressure, iPadOS palm handling, Home Screen lifecycle, downloads and animation responsiveness cannot be established by desktop tests. Basic pen pressure uses Pointer Events when provided by the browser; native-app palm rejection is not guaranteed.

Undo history is session-local and capped at 40 actions per page; saved handwriting persists independently. Active partial strokes are committed on pointer cancellation when the browser delivers that event, but a force-kill before the completed-stroke transaction may lose the in-progress stroke. Keep independent backups. All saved pages are loaded at startup for this first version; performance on years of heavy handwriting is not yet validated.

One writer tab is allowed where Web Locks is available. Other tabs show a message instead of editing stale data. Older browsers without that API require single-tab use. No server copy or automatic cross-device synchronization exists.
