# My Pastel Planner
A web app to emulate a DayTimer planner.

Phase 1 is an offline-capable React/TypeScript iPad planner with monthly/weekly pages, vector ink, IndexedDB saving and JSON backup/restore.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Build with `pnpm build`, test with `pnpm test`, and serve the production build with `pnpm preview`. Upload only the contents of `dist/` to the domain root.

See [documentation](doc/README.md), [hosting instructions](doc/running-and-hosting.md), and the [iPad acceptance checklist](doc/phase-1-testing.md). Page curl, custom inserts and PDF export are later phases. No deployment has been performed.
