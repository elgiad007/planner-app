# Phase 3 customization

Updated: 2026-10-25. Implementation authorized by Luc. Desktop review build; real-iPad acceptance pending. No deployment performed.

## Using the new features

Open **Pages & bookmarks**. Inserts are two-page spreads so both halves stay together through page turns and reordering.

- Choose blank, lined, dot-grid, checklist or sketchbook paper, an optional title and Before/After, then **Insert spread**. Checkboxes are writing guides; mark them with ink.
- **Duplicate spread** copies both pages with new independent page and stroke IDs. Calendar copies retain their original calendar template. Editing a copy does not change its source.
- To reorder, choose Before/After and a **Move destination**, then **Move spread**. This moves the current spread, including both pages. **Open spread** lists the saved order.
- **Bookmark spread** adds a shortcut in the panel. Toggle it again to remove it. Month tabs, Home and date jumps remain direct calendar navigation.
- **Delete custom spread** confirms before deleting both pages and their ink. Original calendar spreads cannot be deleted. Deletion clears session undo/redo; use an external JSON backup to retain a recoverable copy.
- **Highlighter** uses wide translucent strokes. **Pencil** uses softer ink with pressure-dependent opacity and width. Colors and size apply to subsequent strokes.
- **Select / move**: draw a rectangle crossing the strokes you want. Dashed boxes identify selected whole strokes. Drag a selected stroke to move the group within that page; the group stops at the paper bounds. Draw another rectangle to replace the selection, or switch tools to clear it. Undo/redo reverse movement. Cross-page transfers, rotation and resizing are outside this implementation.

Before any organization action, arrows retain Phase 2 month/week navigation. On the first insert, duplicate, move or bookmark action, a saved binder order is established: monthly and weekly 2027 spreads interleaved by date, with boundary weeks included. Arrows/swipes then follow that order, including inserted spreads. Calendar jumps to other years add those years when an order already exists. At the ends of the saved order, use a date jump to open another year.

## Data compatibility

Existing IndexedDB page IDs and ink remain untouched. Organization adds settings fields to the same database stores. New backups use schema 2 and include ordering, inserts, bookmarks and drawing-tool metadata. Version 1 backups remain readable; restoring one replaces the whole planner, including custom pages, after the existing safety-backup confirmations. Phase 1/2 app builds cannot read schema 2 backups: retain a current app build with new backups.

Organization writes commit affected pages and settings atomically. If an organization transaction fails, the visible planner remains unchanged and reports the error. Ink saving failures block organization until Retry save succeeds. No account, server sync or runtime dependency has been added.

## Desktop verification

- `pnpm test`: calendar and legacy storage regressions plus version 1 compatibility, version 2 round trips, invalid references, independent duplicates, stable ordering, bounded movement and rollback of failed organization transactions.
- `pnpm build`: TypeScript, production bundle and offline precache generation.
- With a production preview running: `pnpm test:custom` exercises all five paper types, highlighter/pencil, selection across segment middles, movement, undo/redo, independent duplicate edits, reordering and animated navigation, reload persistence, bookmark navigation, delete cancel/confirm, duplicated calendar templates and full schema 2 restoration. Screenshots: `test-results/phase3-desktop.png` and `test-results/phase3-organizer.png`.
- Existing browser, ink, touch, page-turn and history scripts cover legacy drawing, save retry, offline reload, touch arbitration, interruption recovery, page-turn invariants and history across spreads.
- Set `PLANNER_TEST_URL` when the preview uses a port other than 4173. Browser checks launch isolated temporary Edge profiles and use test data, not installed planner data.

## Real-iPad acceptance

Download and retain a JSON backup before installing the review build.

1. Open existing handwritten calendar pages; verify alignment and colors before and after updating.
2. Insert each paper type before and after a handwritten spread. Write on both halves; turn away and back. Check sharp ink, fixed rings and no lost or shifted handwriting.
3. Duplicate a handwritten calendar and custom spread. Edit and erase the copies; verify the originals remain unchanged.
4. Reorder a custom spread across several calendar spreads. Follow arrows and swipes through its new neighbors. Bookmark it, jump elsewhere, and return using the bookmark.
5. Select several strokes with Pencil, drag them together and against each page edge, undo and redo. Test selection over a long stroke whose endpoints are outside the rectangle. Confirm palm contacts neither draw nor turn pages.
6. Try highlighter and pencil pressure, opacity and size with Pencil Pro. Check latency, repeated lifts and interrupted contacts. Desktop tests cannot establish Pencil feel or palm behavior.
7. Cancel deletion once and verify all data remains. Confirm deletion on a disposable custom spread; reload and confirm it stays deleted and its bookmark is gone.
8. Export a schema 2 backup, retain it in Files, and restore it. Verify inserts, order, bookmarks and editable tools. Test a version 1 restore only in a disposable planner after saving the current backup.
9. Close and relaunch the installed PWA in Airplane Mode; repeat writing and bookmark navigation, then export another backup.

PDF export, large-planner performance work and additional restore/update hardening remain Phase 4.
