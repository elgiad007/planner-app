# My Pastel Planner

My Pastel Planner is a digital DayTimer-style binder for planning your schedule, handwriting notes, making lists, and keeping ideas beside your calendar. It combines monthly and weekly calendars with customizable two-page spreads in a pastel paper-planner layout. It is designed around iPad and Apple Pencil use, with mouse, touch, and keyboard controls for other devices.

**Your planner data stays on your device. Nothing you write or add to the planner is stored on a server or automatically uploaded.** The app saves your planner in your browser's local IndexedDB database. There are no accounts, cloud synchronization, or analytics. Handwriting, text, stamps, settings, and PDF generation are handled on your device.

A web server delivers the app files and updates, but does not receive your planner content. You control any copies you export: saving a backup or PDF to a cloud-synced folder, or sharing it yourself, can move that copy off your device.

## Calendar and navigation

- **Monthly and weekly spreads:** plan across two facing pages, starting with a 2027 binder, and use the date picker to visit other years.
- **Quick navigation:** use month tabs, previous/next arrows, a date jump, Today, or month/week switching. Browse dates lets you tap calendar dates.
- **Paper-style page turns:** animated page curls, horizontal swipes, and outer-edge taps provide binder-style browsing.
- **Find your content:** month-tab indicators show where you have added content, and previous/next populated-spread controls help you return to it.
- **Named bookmarks:** save favorite spreads, rename bookmarks, and return to them from the bookmark list.
- **Optional holidays:** show or hide U.S. federal holidays and common occasions on calendar pages and PDF exports.

## Handwriting, text, and stamps

- **Pen, pencil, and highlighter:** write or draw with adjustable colors and widths, pressure-sensitive pencil strokes, and translucent highlighting.
- **Eraser and selection:** erase whole strokes, select handwriting with a box, and move selected ink.
- **Editable text:** add multiline text blocks; change font size and color; edit, move, resize, or delete blocks.
- **Reusable stamps:** draw your own stamp, keep it in a local library, and place it repeatedly on pages. Move or delete placements, or find the spreads containing a particular stamp.
- **Undo and redo:** reverse edits across pages without leaving your current spread. Edit history lasts for the current session.
- **Saved tool preferences:** remember the selected tool, ink/highlighter colors and widths, and default text font size.
- **Input options:** write with Apple Pencil or a mouse, or enable Finger writing for a finger or touch stylus. Finger writing resets to off when the app reopens to help prevent accidental palm marks.

## Make the binder your own

- Add titled two-page inserts using **blank, lined, dot-grid, checklist, or sketchbook** paper.
- Duplicate a spread with its content, place custom spreads before or after another spread, and move or delete custom spreads. Original calendar spreads keep their order.
- Rename the planner; its name appears above the binder and in the browser tab.
- Zoom from **100% to 250%**, pinch with two fingers, scroll enlarged pages, or use the Hand tool to pan. Fit spread returns to the full two-page view.
- Use keyboard shortcuts for navigation, writing tools, undo/redo, zoom, and temporary panning. Press **?** for Help or see the [keyboard shortcut list](doc/keyboard-shortcuts.md).

## Local saving, backups, and PDF export

Changes save automatically in the current browser on the current device. **There is no server copy and no automatic transfer between browsers or devices.** Clearing browser storage or losing the device can remove your planner, so keep regular backups outside the app.

- **Save planner…** exports an editable JSON file containing planner pages, content, and settings. Supported browsers offer a Save As dialog; other browsers download the file. JSON backups are readable and unencrypted.
- **Open planner…** validates an existing planner file and replaces the active planner after a safety download and confirmation. Older compatible planner files remain supported. Use this to restore a backup or manually transfer a planner to another device.
- **Export PDF** creates a visual copy of the current spread or the entire binder, including page templates and your content. PDF creation works locally and offline. PDFs cannot be reopened as editable planners; keep JSON backups for that purpose.
- **Recovery controls** provide save warnings, retry options, and a way to download raw recovery data if stored records cannot be loaded safely.

## Offline use and installation

The production app is an installable progressive web app (PWA). On iPad, open it in Safari and choose **Share → Add to Home Screen**. Open the installed app online once and wait for **offline app ready** before relying on it without a connection. Then test closing and reopening it in Airplane Mode.

Once cached, the planner and PDF export work offline. In Help, **Check for updates** checks online for a new app release. An available update offers a backup-before-update flow.

Real-device iPad/Safari/Apple Pencil acceptance testing remains outstanding; see the [testing checklists](doc/README.md).

## Run locally

Install Node.js and pnpm as described in the [running and hosting guide](doc/running-and-hosting.md), then run:

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1
```

On Windows, you can also double-click `start-test-server.cmd`. It starts a localhost development server and opens your browser. Source changes refresh automatically; keep the server window open and press Ctrl+C to stop it. Nothing is uploaded.

Build, run unit tests, and preview the production app with:

```sh
pnpm test
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

Use the production preview to test offline behavior; development mode does not install the service worker. Localhost and a hosted site have separate browser storage.

## Hosting and technical details

The app uses React, TypeScript, and Vite, with IndexedDB for planner storage and a service worker for offline app files. It runs as a static website: no application backend, server database, or account service is required.

To host it, upload only the **contents of `dist/`**, including `.htaccess`, to the HTTPS domain root. On Windows, `update-release.cmd` builds and packages a versioned release ZIP without deploying it. See the [hosting and update instructions](doc/running-and-hosting.md) for the full procedure.

Further documentation:

- [Documentation index and testing checklists](doc/README.md)
- [Data storage and backups](doc/data-storage.md)
- [Keyboard shortcuts](doc/keyboard-shortcuts.md)
- [Running, hosting, and updating](doc/running-and-hosting.md)
