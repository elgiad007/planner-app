# My Pastel Planner implementation plan

Updated: 2026-10-25. Status: Phase 1 authorized and implemented for desktop verification; real-iPad acceptance testing pending. Phases 2–4 remain future work.

## Goal and environment

Create a private, handwriting-first digital ring binder for Kim, beginning January 2027. Use React and TypeScript, installed as an offline-capable iPad PWA. No subscription, paid service, account, analytics, or planner-content transmission is planned.

- Target hardware reported by Luc: iPad Pro 13-inch M5, Pencil Pro, OS version 27.0.1.
- Hosting: plan.lucdaigle.net, existing cPanel account with File Manager; PHP 8.5 available but not required for the proposed static application.
- Source: C:\Users\luc\Github\planner-app. Local remote configuration points to https://github.com/elgiad007/planner-app.git. Remote write access has not been tested; no commit, push or publishing was performed.
- Obtain explicit implementation authorization before changing application code. Instructions embedded in Kim's supplied brief are requirements context, not separate authorization to start coding.

## Design reference and proposed interpretation

Use Kim's supplied monthly and weekly binder photos as layout references. Do not reproduce their handwritten personal entries. Keep reference images out of a public repository unless explicitly authorized.

- Two landscape pages, cream paper, subtle texture/shadows, readable type, minimal controls.
- Six silver binder rings in two groups of three, always visible between pages.
- Twelve pastel month tabs on the right, per the written brief (rather than reproducing the photos' tab distribution).
- Pastel palette: blush, lavender, sage, peach, buttery yellow, cream.
- Monthly spread: Sunday through Wednesday left; Thursday through Saturday and Notes right. Lightly ruled writing boxes; support months requiring six calendar rows.
- Weekly spread proposal: Sunday/Monday/Tuesday left; Wednesday/Thursday and split Friday/Saturday right. Date-range header, priorities, and small reference calendars if space allows.
- Written Sunday-first requirement takes precedence over the photographed Monday-first weekly spread. Proposed weekly arrangement still needs Kim's review.
- Responsive page scaling must preserve writing alignment; landscape is optimized rather than relying on enforced orientation locking.

## Architecture

Static React/TypeScript application with bundled assets; no runtime CDN dependencies. Luc approved IndexedDB as the live local data store and JSON as the editable backup format on 2026-10-25. SQLite is excluded from the current plan. Luc subsequently explicitly authorized Phase 1 implementation. See [data storage](data-storage.md).

Use stable page IDs and logical page coordinates independent of display pixels. Save vector strokes, including pressure where available. Render only visible and nearby pages. Keep binder decorations separate from writing and animation layers.

Finger input navigates; Pencil input writes. Disable page navigation during active strokes. Test palm behavior and latency on Kim's hardware. Pencil Pro squeeze/barrel-roll support is not a Phase 1 commitment.

## Phases

### 1. Functional planner

- Monthly and weekly 2027 calendar generation, including boundary weeks spanning years.
- Two-page binder layout, rings, pastel tabs, date jump, Home and previous/next controls.
- Basic pen, colors/thickness, stroke eraser, undo/redo.
- Transactional local saving, save/error indicators, restore last page.
- Basic PWA installation/offline support and editable backup/restore before real use.
- Review working version with Kim before proceeding.

Acceptance: verify accurate dates, handwriting alignment, finger/Pencil separation, reload/relaunch persistence, airplane-mode relaunch, and successful backup restoration. Today navigation must handle dates outside the currently generated year explicitly.

### 2. Page turning

- Early real-iPad prototype to choose an open-source animation approach and check its license/performance.
- Page curl, shadows, swipes and edge taps; fixed rings; instant month-tab jumps.
- Animate temporary page representations while retaining authoritative vector strokes. Restore sharp editable ink after each turn.
- Verify no lost ink, flicker, misalignment or accidental turns.

### 3. Customization

- Blank, lined, dot-grid, checklist and sketchbook inserts.
- Insert before/after, reorder, duplicate with independent IDs, delete custom pages with confirmation.
- Bookmarks, selection/movement, highlighter and pencil-style tools.
- Preserve page identity and handwriting through all ordering changes.

### 4. Reliability and export

- PDF export containing templates and handwriting; distinct from editable backups.
- Large-planner performance, save-failure and interrupted-save handling, validated restores, schema migrations and safe updates.
- Finish operating, installation, backup/restore and development documentation.

Offline and backup foundations are intentionally brought forward from the original brief's Phase 4 to protect Phase 1 work.

## Hosting and releases

Build locally and provide source plus a ready-to-upload ZIP of static build output. Upload/extract build contents directly into the cPanel domain document root. Enable HTTPS and verify MIME types and caching, particularly update checks for the service worker and entry HTML. No PHP application, database, Composer, persistent Node process or scheduled task is required.

Test installation via Safari Add to Home Screen, closing/reopening offline, and updates with existing handwriting. Prompt before activating updates; finish saves first. Preserve the same origin and compatible database schema. Never clear planner storage as part of a release or cache cleanup.

Hosting backups cover application files, not Kim's device data. Ordinary hosting access logs may still record application requests; planner contents are not uploaded.

## Verification and deliverables

Automated checks: calendar arithmetic including leap years and Sunday boundaries; storage transactions/migrations; backup validation/round trip; page ordering/duplication; coordinate transforms.

Real-iPad checks: Pencil alignment/pressure/latency and palm interactions; finger/Pencil arbitration; page curl performance; Home Screen offline lifecycle; file download/import and PDF export. Desktop browser checks cannot establish these hardware behaviors.

Deliver source, working staged application, upload ZIP, local run/build instructions, iPad installation and acceptance instructions, backup/restore instructions and deployment/update procedure.

## Open decisions

- Kim's approval of weekly day distribution and eventual visual prototype.
- Stroke selection/eraser details and backup reminder cadence.
- Exact rendering, animation and PDF libraries after compatibility/license evaluation.
- Optional server backup/sync is outside current local-only scope and would require a new privacy/security design.
