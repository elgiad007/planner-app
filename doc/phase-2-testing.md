# Phase 2: page turning

Implemented 2026-10-25. Desktop review build; real-iPad acceptance remains pending.

Previous/next arrows, one-finger horizontal swipes, and quick taps within the outer paper edges turn one spread. Month tabs, Home, date selection and mode changes jump instantly. Finger writing disables paper navigation gestures unless Browse dates is selected. Multitouch, canceled gestures, vertical movements and long holds do not turn pages. Writing blocks navigation, with a short cooldown before touch navigation resumes. Reduce Motion uses instant navigation.

## Animation and data

StPageFlip 2.0.7 provides soft-page curls and shadows. It is MIT licensed: [upstream source and license](https://github.com/Nodlik/StPageFlip). It is bundled locally; no CDN requests are required. A reproducible pnpm patch stops the animation frame loop and removes the resize listener on destruction. `public/page-flip-LICENSE.txt` preserves the upstream license in upload builds.

Only four disposable page copies enter the animation engine. Canvas bitmaps are copied explicitly; IndexedDB records, page IDs and vector strokes remain authoritative. The animation overlay sits below the fixed rings. Incoming ink is rendered before copying, and React restores the editable canvas after the turn. Resize, page hiding and a timeout complete interrupted turns so navigation does not remain locked. No storage schema or layout version changes are needed.

## Desktop checks

The animation overlay clips temporary curled-page overflow within the binder. This prevents transient document growth and the scrollbar-induced leftward shift. Regression checks compare document dimensions, binder/ring positions and scroll offsets on every sampled frame in both turn directions and portrait orientation.

Run `pnpm test`, `pnpm build`, `pnpm test:browser`, `pnpm test:ink`, `pnpm test:touch`, and `pnpm test:turn` with the production preview running on port 4173. Page-turn checks cover copied ink pixels, unchanged backup strokes, arrows, native browser touch swipes/edge taps, multitouch rejection, finger-writing exclusion, instant tabs, repeated turns, portrait, reduced motion, reload and zero pending animation frames after cleanup. Screenshots are written to `test-results/`.

## Kim's iPad acceptance

1. Download a JSON backup before installing the review build. Update on the same origin and keep website data.
2. Write near all four page corners with Pencil. Turn away and back repeatedly using arrows and one finger. Confirm sharp ink, unchanged alignment and no missing strokes.
3. Rest a palm while writing; try a finger contact during a stroke. Confirm no accidental turns. Test after lifting Pencil as well.
4. Swipe left/right, tap outer edges, try vertical swipes, long holds and two-finger contacts. Confirm deliberate single turns only. Verify Finger writing and Browse dates separately.
5. Review curl smoothness, shadows and fixed rings in landscape and portrait. Rotate during a turn and background/reopen the app mid-turn.
6. Enable Reduce Motion in iPad accessibility settings and verify instant turns. Relaunch offline, turn monthly/weekly pages across a year boundary, and confirm handwritten data persists.
7. Export and restore a backup containing handwriting on both sides of several spreads.

Desktop automation does not establish Safari/Pencil palm rejection or iPad frame rate. Review those before accepting the animation approach for regular use. Custom inserts, advanced tools and PDF export remain later phases.
