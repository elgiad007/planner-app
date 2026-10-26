# My Pastel Planner
A web app to emulate a DayTimer planner.

Use `?` to open Help with the full [keyboard shortcut list](doc/keyboard-shortcuts.md), including navigation, tool selection, undo/redo, zoom, and temporary panning.

An offline-capable React/TypeScript iPad planner with monthly/weekly pages, vector ink, IndexedDB saving and editable JSON file saving/opening. Includes custom two-page inserts, page organization, bookmarks, highlighter, pencil-style ink, stroke selection/movement and animated page curls. Phase 4 adds offline PDF export, coalesced saves, validated local records, additive backup migrations and recovery controls.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Build with `pnpm build`, test with `pnpm test`, and serve the production build with `pnpm preview`. Upload only the contents of `dist/` to the domain root.

On Windows, double-click `start-test-server.cmd` to test current source locally. It opens your browser and refreshes changes automatically. Keep the server window open and press Ctrl+C to stop. Nothing is uploaded.

See [documentation](doc/README.md), [hosting instructions](doc/running-and-hosting.md), and the [Phase 4 acceptance checklist](doc/phase-4-testing.md). Real-iPad acceptance remains required. No deployment has been performed.

Planner names can be changed with **Files → Rename planner…**. The active name appears above the planner and in the browser tab. **Save planner…** downloads an editable JSON file with that name; **Open planner…** replaces the active planner after a safety download and confirmation. Older planner files remain supported.

Changes are saved automatically in this browser on this device. There is no cloud sync. Keep downloaded planner files in a safe location; clearing browser storage or losing the device can remove the local planner. PDFs are visual exports and cannot be opened as editable planners.
