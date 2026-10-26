# Data storage and backups

Updated: 2026-10-25. Status: Phase 4 hardens validation, recovery and save queuing while retaining the approved storage format. iPad acceptance testing pending.

## Agreed combination

Use IndexedDB for live local storage and versioned JSON for portable, editable backups. Luc approved this combination on 2026-10-25. PDF is a visual export only. SQLite is not part of the implementation plan; the alternatives below are retained for decision history.

IndexedDB stores structured objects with transactions and indexes; JSON is a serialization format, not a database. Keep records JSON-compatible so they can be exported without losing editable content. Do not rewrite one giant JSON document after each stroke.

## Proposed logical records

- Planner metadata: ID, schema version, supported years, layout version, timestamps.
- Pages: stable ID, template type, date/week association, logical width/height.
- Page ordering: ordered references to generated and inserted pages; no identity based solely on array position.
- Strokes: stable ID, page ID, tool, color, width, ordered x/y/pressure samples and optional time/tilt samples when supported.
- Bookmarks and settings: page references, last opened spread, selected tools and preferences.

Persist completed strokes incrementally. Mark a save complete only after its transaction succeeds. Handle quota/transaction failures visibly. Track schema and layout versions so changes do not silently move existing ink. Keep repository/storage access behind an interface to permit future migration.

The save queue keeps only the latest waiting snapshot of each page/settings record; an already-running transaction finishes before its successor. Failures leave the in-memory planner available for JSON export and a whole-planner atomic Retry save. Closing before a successful save can lose the latest unsaved work; interrupted transactions retain their previous committed state. There is no claim that an uncommitted stroke survives a force quit.

Local settings now carry `dataSchemaVersion: 2` and `layoutVersion: 1`. Missing markers are legacy-compatible; unsupported markers block opening without modifying records. The IndexedDB database stays at version 1: no store change is needed. Every load validates all saved pages and references. Failed opens expose raw recovery download and validated-backup restore only after this tab has obtained the writer lease (or the browser's documented single-tab fallback).

## Backup format

Filename: my-pastel-planner-<ISO timestamp with filename-safe separators>.json.

Phase 1 top-level fields: format identifier, schemaVersion, layoutVersion, appVersion, exportedAt, pages (containing vector strokes), and settings (including the last view). Page IDs encode month/week date and left/right side. Logical pages are 600 × 800 units. Phase 3 exports schema 2, adding settings.order (stable spread references), settings.inserts (ID, paper, title, optional duplicated-calendar source), and settings.bookmarks. Custom page IDs are custom:<UUID>:left/right; strokes optionally record pen/highlighter/pencil. Existing records without a tool render as pen. Version 1 backups remain accepted, with custom organization absent until the first organization action. The IndexedDB stores and database version stay unchanged: these are additive record fields, not a destructive database upgrade. Calendar templates are regenerated from page IDs and the layout version. Duplicated calendar spreads retain their calendar template association but have independent page and stroke IDs.

Insertion, duplication and deletion commit affected page records and settings in one IndexedDB transaction. Reordering and bookmarking change references only. Deletes remove both custom page records and their bookmark, and clear session ink history to prevent undo from recreating deleted records. Generated calendar spreads cannot be deleted. Invalid/missing insert, order, bookmark and template references are rejected before a restore transaction starts.

Validate format/version, sizes, values, duplicate IDs and references before modifying live data. Initial restore behavior should be full replacement after confirmation, with a pre-restore backup offered and transactional replacement. Reject unsupported future formats without changing current data. Verify a complete round trip on the actual iPad.

Plain JSON backups are readable and not encrypted. Save them to a user-selected location; choosing iCloud Drive or another cloud folder is the user's action and differs from the application uploading data. Optional compression/encryption can be evaluated later.

Restoring a schema 1 backup explicitly migrates it to schema 2 with empty organization metadata. IDs, coordinates and tool data are preserved; applying the migration twice has the same result. Unknown settings/view fields are excluded from validated imports. Unsupported future schema/layout versions are rejected before any transaction. Raw recovery files use `my-pastel-planner-recovery-records`, retain unreadable records for troubleshooting and are deliberately not accepted as ordinary editable backups.

PDFs are visual snapshots at 2x logical resolution, with JPEG-compressed pages and one two-page spread per landscape sheet. They cannot be imported to recover editable content. Keep JSON backups alongside PDFs. A seven-day reminder is based on the last JSON download request; the app cannot verify that a downloaded file was retained in Files.

## Where data lives

Live planner content stays in the installed app's browser-managed storage on Kim's iPad. No account, server copy, automatic sync or planner-content API is proposed. Another device will not automatically see the planner. Manual backup import can transfer a snapshot but is not synchronization.

Application code/assets are downloaded from plan.lucdaigle.net. Updates may contact that origin. Host logs may record those requests. Bundle fonts/libraries locally; add no analytics or third-party runtime requests.

Browser storage is not a permanent backup. Site-data clearing, device loss or storage eviction can remove data. Request persistent storage when available, explain its limitations, and provide backup reminders and last-export status. Keep a recent backup outside the app, particularly before releases, device changes or restores. Hosting backups do not include device-local content.

## Alternatives

| Option | Benefits | Tradeoffs |
| --- | --- | --- |
| IndexedDB + JSON export | Browser-native transactional live storage; portable inspectable backups; static hosting | Browser storage lifecycle still requires independent backups |
| Local SQLite via WebAssembly + OPFS | SQL queries and database file model; remains offline/local | Additional worker/runtime/persistence integration; actual Safari testing required; still browser-managed storage |
| PHP + server-side SQLite, JSON stroke fields | Could provide remote backup or shared data | Requires network for server access; authentication, HTTPS API, authorization, backup policy and conflict handling; changes local-only requirement |
| JSON file alone | Simple portable format | Not a practical automatic live-file persistence strategy across iPad browsers; whole-file rewrites are a poor fit for frequent ink updates |

If remote recovery becomes a requirement, retain local-first storage and design an optional authenticated backup service separately. Store any server SQLite database outside the public document root. A public JSON file or publicly downloadable database must never hold private planner data.

## Technical references

- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology)
- [SQLite WASM persistent storage options](https://sqlite.org/wasm/doc/tip/persistence.md)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)

Text blocks are optional `page.textBlocks` objects alongside strokes in the additive schema 2 record format. Each stores an independent ID, contents, color, logical position, box dimensions, and font size. Older records without text remain readable. Validation rejects invalid text before import or local loading. Duplication assigns new IDs; undo/redo restores the complete page, including both strokes and text. PDF output uses the same line wrapping and clipping as the on-screen text layer.

Tool preferences are additive settings fields included in JSON backups: selected tool, shared pen/pencil/text color, pen/pencil width, separate highlighter color and width, and default text font size (8-96). Tool settings contains the default font-size control; it applies to new text blocks only. Missing preferences use the existing defaults. Invalid preferences are rejected during local load and backup restore. Box dimensions and finger-writing behavior are unchanged.
