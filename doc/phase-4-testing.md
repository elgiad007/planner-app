# Phase 4 reliability and PDF export

Updated: 2026-10-25. Implemented with Luc's authorization. Desktop review build 0.4.0; real-iPad acceptance pending. No deployment performed.

## Using PDF export

Select **Export PDF**, choose **Current spread** or **Entire binder**, then **Create PDF**. Progress reports completed spreads. After generation, tap **Download PDF** and save it in Files. The export panel closes when you tap the download link; the download continues. Reopen **Export PDF** to access the generated file again during the same app session. This separate download action supports browsers that require a direct user gesture. **Cancel PDF** releases the export resources and writing lock at the next page boundary.

Each PDF sheet contains the left and right paper templates and handwriting. Rings, tabs, selection handles and app controls are omitted. Calendar dates, custom paper and duplicated calendar templates use the same React templates as the planner. Pressure-sensitive pen/pencil and highlighter rendering share the app's drawing helpers. Export uses a fixed 600 x 800 logical page, rasterized at twice that resolution and compressed as JPEG; text and ink in the PDF are flattened visual content, not selectable vector content.

Entire binder export preserves saved ordering, includes generated 2027/current-year pages, and appends any handwritten calendar spreads from previously visited years that are not already listed. If no ordering was saved, calendars are interleaved by date. Only one paper canvas is rendered at a time, although compressed PDF images accumulate until download. Very large binders can still exceed iPad memory; use current-spread exports if needed. Existing import limits remain 100 MB, 20,000 page records and five million points.

PDF files cannot replace **Download backup**. JSON backups retain editable strokes, ordering and bookmarks. PDF generation works offline after the complete app precache is installed; no planner content is sent to a server. A generated PDF remains a snapshot of the planner at generation time.

## Failure and recovery behavior

- Save queues coalesce waiting writes per page/settings record, preserving the latest edit and the active transaction. Save failures retain in-memory ink, show a warning and allow backup download or atomic **Retry save**.
- Restore validates the complete backup before changing storage. Schema 1 migrates additively to schema 2. Future schemas/layouts and invalid values/references are rejected. Aborting a replacement rolls back both clearing and new writes.
- Opening validates existing local records. Invalid data or an unsupported local schema stops editing without deleting records. **Download recovery data** preserves raw records for troubleshooting; it is not an ordinary backup. To recover, select a known good JSON backup, retain the raw recovery download, then confirm replacement. If storage itself is inaccessible, close other tabs and try again; the app never clears storage automatically.
- Local version markers are additive settings fields; no IndexedDB store upgrade or ink-coordinate migration occurs. Connection failures can be retried, and connections close on a later database upgrade request.
- App updates retain the existing save-queue drain, failed-save block, downloadable safety backup and confirmation before activation. Offline caches cover the lazy PDF code as well as the initial application. Keep old hashed assets on the server during a release transition.

## Desktop verification

Run `pnpm test` and `pnpm build`. Serve the production build with `pnpm preview --host 127.0.0.1 --port 4173` before browser checks. Set `PLANNER_TEST_URL` if another port is used. Scripts use isolated temporary Edge profiles and synthetic planner content.

- 21 unit tests cover calendar and customization regressions, idempotent schema migration, invalid/future import rejection, future local-version guards, invalid persisted records, interrupted transaction rollback, coalesced save ordering and a 1,000-insert / 200,000-point round trip. The large fixture validated, saved and loaded in approximately 0.5 seconds in this desktop environment; this is not an iPad performance guarantee.
- `pnpm test:reliability` restores/reloads 250 inserts with 200,000 points, exports month/week/dot-grid/checklist PDFs offline, checks actual highlighter pixels in the export canvas, cancels a binder export and verifies unchanged editable ink. It also downloads unsupported-version recovery records, restores a known good backup through the recovery screen, and completes a 65-sheet 2027 binder PDF. Desktop measurements: approximately 3 seconds for large restore/reload, 30 seconds and 10.6 MB for the full binder.
- Existing `test:browser`, `test:ink`, `test:touch`, `test:turn`, `test:custom`, `scripts/history-check.mjs` and `scripts/update-check.mjs` exercise drawing, failed-save retry, interruption recovery, touch exclusion, offline reload, ordering, history and backup-gated updates.
- Export samples are under `test-results/phase4-*.pdf`. PDFs are rendered with Poppler for visual inspection of templates, guides, both page halves, ink pressure/color and highlighter. Desktop screenshots do not establish Safari/Pencil behavior.

## PDF export performance (2026-10-26)

The exporter freezes computed styles with one bulk assignment per element and excludes unrelated app subtrees (including live canvases) from html2canvas's document clone. Resolution, JPEG quality, and one-paper-canvas memory behavior are unchanged.

On the same desktop preview, a 65-spread synthetic binder took 34,314 ms before and 26,345 ms after (about 23% less time). Both files were 11,124,825 bytes and all 130 embedded page JPEGs were byte-for-byte identical. These are single-run desktop measurements; real-iPad speed and memory still need checking.

Run `pnpm test:pdf` against a production preview (`PLANNER_TEST_URL` can override the URL). It checks full-binder sheet count, offline export, cancellation, canvas cleanup, unchanged saved pages, and browser errors. Optional arguments preserve a named output and compare all page JPEGs with an earlier fixture export: `node scripts/pdf-check.mjs optimized test-results/pdf-baseline.pdf`. Outputs go to `test-results/pdf-<label>.pdf`.

## Real-iPad acceptance

Retain a recent JSON backup in Files before installing the review build.

1. Update with existing handwritten pages. Confirm ink alignment, page order, bookmarks and all drawing tools. Cancel the update once and check the planner remains usable; complete it after retaining its backup.
2. Export the current handwritten month, a boundary week, every insert paper and a duplicated calendar. Save and open PDFs in Files. Check both halves, dates, writing guides, dots, checkboxes, pen pressure, pencil opacity and highlights at normal size and zoom.
3. Export the entire binder. Check the first/last sheets, saved order, inserted pages and handwritten pages from other years. Cancel generation once, then write and save normally.
4. Close/reopen the installed PWA in Airplane Mode. Write, export a PDF and download an editable JSON backup. Reopen the saved files in Files.
5. On a disposable test planner, restore a schema 1 and schema 2 backup. Verify editable strokes and organization. Cancel each restore confirmation once; existing content must remain unchanged.
6. Use a representative long planner to judge navigation and Pencil latency, backup/restore duration and full PDF memory use. Test real Pencil/palm behavior; desktop timing cannot establish these.
7. Interrupt a completed-stroke save by backgrounding, then relaunch. Previously committed pages must remain intact. If a save warning appears, keep the app open, download a JSON backup and retry. Do not clear site data as a recovery step.
