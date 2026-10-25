# Running, hosting, and updating

## Local development

Install a supported Node.js LTS version (22.12+ or 24+) and pnpm 11. Use the repository folder:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development mode does not install a service worker. Use the production preview for offline testing:

```sh
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

Open http://127.0.0.1:4173 on the same computer. A plain HTTP LAN address is not a substitute for an HTTPS iPad installation. Localhost development and the hosted domain have separate local databases.

## cPanel deployment

To rebuild `dist/` from the current source and refresh the release ZIP, run:

On Windows, double-click `update-release.cmd` in the repository root. The launcher keeps the window open until you press a key, even if PowerShell fails to start the script. It uses Windows PowerShell with an execution-policy override for that process only; it does not change your saved execution policy. For unattended use, run `update-release.cmd -NoPause`.

Alternatively, from a PowerShell terminal:

```powershell
pwsh -File ./scripts/update-release.ps1
```

The script displays the selected Node.js and pnpm paths. It prefers tools installed on PATH and falls back to Codex's bundled runtime under your Windows user profile when available. Any PATH additions apply only during the script run; your saved Windows PATH is unchanged. If neither location provides the required tools, the results show setup guidance.

Numbered stages and live build output show progress. The final summary displays success or failure, elapsed time, output paths, ZIP size and verified file count. Press Enter after reviewing the results to exit (including after a failure). For unattended runs, use `pwsh -File ./scripts/update-release.ps1 -NoPause`; failures return exit code 1.

The script requires pnpm and installed dependencies (`pnpm install --frozen-lockfile` on first setup). It works from any working directory when given the script's full path. It runs the existing production build, packages every output file including `.htaccess` directly at the ZIP root, and verifies file counts and SHA-256 hashes before replacing `release/my-pastel-planner-v<version>.zip`. The version is read automatically from `package.json`; the current filename is `my-pastel-planner-v0.4.0.zip`. A failed build or verification preserves the previous ZIP. It does not upload or deploy anything.

1. Enable HTTPS for plan.lucdaigle.net and redirect HTTP to HTTPS through cPanel.
2. Build with `pnpm build`. The output is in `dist/`; `scripts/offline.mjs` generates the icons, manifest and complete offline asset list.
3. Upload the versioned ZIP from `release/` (currently `my-pastel-planner-v0.4.0.zip`) or ZIP the **contents** of `dist/`, including `.htaccess`.
4. In cPanel File Manager, open the exact document root assigned to plan.lucdaigle.net. Enable “Show Hidden Files” in Settings. Extract the ZIP there so `index.html`, `sw.js`, `.htaccess`, icons, manifest and `assets/` are directly in the domain root, not inside `dist/` or another subfolder.
5. Visit https://plan.lucdaigle.net and follow the iPad checks below. No Node process, PHP scripts or database are needed on the server.

Do not upload source files, node_modules, tests, Git metadata or personal JSON backups. The build is intended for the domain root, not a subdirectory. If the server rejects `.htaccess`, check Apache overrides with the host; preserve the MIME types and no-cache handling for index.html, manifest and sw.js.

## iPad installation

Open the HTTPS address in Safari. Share → Add to Home Screen (enable Open as Web App if offered). Open the installed icon online, allow the offline cache to finish, then test closing/relaunching in Airplane Mode. Test in the installed app before entering real planner content; do not assume a Safari tab and installed app always share data.

Use Pencil to write. Fingers do not draw. Use month tabs/arrows to navigate and Browse dates to tap calendar date numbers. A desktop mouse also writes for testing. Eraser removes entire strokes. Undo/redo follow ink edits across all pages, including selection movement, and are session-local. Use Pages & bookmarks to add or organize two-page inserts. See [Phase 3 usage and acceptance](phase-3-testing.md).

Use **Export PDF → Current spread / Entire binder → Create PDF**, then **Download PDF** and retain it in Files. PDFs are flattened visual snapshots; use JSON backups to recover editable ink. The PDF renderer and all its dependencies are precached for offline use. See [Phase 4 usage and acceptance](phase-4-testing.md).

## Backups and updates

Download a JSON backup regularly; save it in Files outside the app, ideally somewhere recoverable if the iPad is lost. The app can initiate a download but cannot verify that the file was retained safely. Backups are readable and unencrypted. A user-selected cloud destination is separate from app-managed synchronization.

Restore validates the file before touching storage, downloads a safety copy, then asks for a second confirmation. Restore replaces local content transactionally; it does not merge planners. Maximum import size is 100 MB and maximum total imported stroke points is five million in schemas 1 and 2. Phase 4 validates saved records and coalesces waiting writes. See the Phase 4 checklist for measured desktop fixture sizes and remaining iPad acceptance.

Before deploying updates, take a backup. Upload all new build files together, retaining old hashed assets during the transition. Use the app's **Back up and update** prompt after its saves finish. Do not clear website data to force an update: that removes handwriting. Service-worker cache cleanup touches only app caches, not IndexedDB. Changing domain/protocol changes the storage origin and requires manual transfer using JSON backup/restore.

If local records fail validation, opening stops without replacing anything. Download the raw recovery data before selecting a known good JSON backup in the recovery screen. The recovery JSON is intended for troubleshooting and cannot be imported through ordinary Restore. Retain compatible app releases with backups; unsupported data/layout versions are deliberately blocked. A save warning during normal use requires keeping the app open, downloading a normal JSON backup and using Retry save.

## Development checks and dependency licenses

Run `pnpm test` for unit/transaction/migration tests. After starting a production preview, run `pnpm test:reliability` for offline PDF and recovery tests, plus the other `test:*` scripts for drawing/touch/page-turn/customization regressions. `node scripts/history-check.mjs` and `node scripts/update-check.mjs` cover history and backup-gated updates. Browser scripts require Microsoft Edge and create temporary test profiles. They do not touch an installed planner profile. `PLANNER_TEST_URL` overrides the default preview URL.

PDF export uses html2canvas 1.4.1 and jsPDF 4.2.1, both MIT-licensed and installed through the lockfile. Their license notices and transitive dependency notices are included in `third-party-notices.txt` in the upload package. No CDN, hosted renderer or PDF service is used. The optional core-js postinstall is disabled in pnpm's build policy; its runtime files remain bundled as needed. The PDF renderer is loaded on demand and precached offline; Vite's large-chunk advisory for this renderer is expected.

No publishing or server upload has been performed by the implementation process.
