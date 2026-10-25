# Data storage and backups

Updated: 2026-10-25. Status: approved approach implemented in Phase 1; iPad acceptance testing pending.

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

## Backup format

Filename: my-pastel-planner-<ISO timestamp with filename-safe separators>.json.

Phase 1 top-level fields: format identifier, schemaVersion, layoutVersion, appVersion, exportedAt, pages (containing vector strokes), and settings (including the last view). Page IDs encode month/week date and left/right side. Logical pages are 600 × 800 units. Page ordering and bookmarks will be added with versioned migrations when custom pages are implemented. Calendar templates are regenerated from page IDs and the layout version.

Validate format/version, sizes, values, duplicate IDs and references before modifying live data. Initial restore behavior should be full replacement after confirmation, with a pre-restore backup offered and transactional replacement. Reject unsupported future formats without changing current data. Verify a complete round trip on the actual iPad.

Plain JSON backups are readable and not encrypted. Save them to a user-selected location; choosing iCloud Drive or another cloud folder is the user's action and differs from the application uploading data. Optional compression/encryption can be evaluated later.

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
