# My Pastel Planner
A web app to emulate a DayTimer planner.

An offline-capable React/TypeScript iPad planner with monthly/weekly pages, vector ink, IndexedDB saving and JSON backup/restore. Includes custom two-page inserts, page organization, bookmarks, highlighter, pencil-style ink, stroke selection/movement and animated page curls. Phase 4 adds offline PDF export, coalesced saves, validated local records, additive backup migrations and recovery controls.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Build with `pnpm build`, test with `pnpm test`, and serve the production build with `pnpm preview`. Upload only the contents of `dist/` to the domain root.

See [documentation](doc/README.md), [hosting instructions](doc/running-and-hosting.md), and the [Phase 4 acceptance checklist](doc/phase-4-testing.md). Real-iPad acceptance remains required. No deployment has been performed.
