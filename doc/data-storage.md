# Data storage and backups

## Your data stays on your device

Your planner is saved automatically in the current browser's local storage (IndexedDB). Handwriting, text, stamps, bookmarks, custom spreads, and settings are stored on your device. There are no accounts, server copies, automatic uploads, or cloud synchronization. PDF exports are also created on your device.

The hosting service delivers app files and updates; it does not receive your planner content. Hosting backups do not include your planner. Exported files only leave your device if you choose to share them or save them to a cloud-synced destination.

Each browser and website address has separate storage. Another browser, device, or hosting address will not automatically have your planner. A Safari tab and an installed Home Screen app may also have separate storage.

## Save an editable backup

1. Open **Files → Save planner…**.
2. Choose a folder and filename in browsers that offer a Save As dialog. Other browsers download the file.
3. Keep the resulting JSON file somewhere you can find it outside the app.

The file includes your editable planner content and settings. JSON backups are readable and unencrypted; choose their storage location accordingly. Cancelling a Save As dialog leaves the backup date unchanged. The app cannot verify that a downloaded backup was retained safely.

Save backups regularly, especially before installing an update, opening another planner, changing devices, or changing the hosting address. Clearing website data, browser storage eviction, or losing a device can remove the local planner.

## Open a backup or transfer your planner

1. If moving to another device, transfer your saved JSON file using a method you choose.
2. Open the planner on the destination device or browser.
3. Choose **Files → Open planner…** and select the JSON file.
4. Retain the safety download of the current planner and review the confirmation before replacing it.

Opening a planner replaces the active planner; it does not merge two planners. Files are validated before replacement, and older compatible planner files remain supported. Unsupported or invalid files are rejected without replacing the current planner.

## Export a PDF

Choose **Export PDF**, select **Current spread** or **Entire binder**, then choose **Create PDF**. Once it is ready, choose **Download PDF** and save the file.

PDFs contain visual copies of your pages and content. Export works offline once the app is cached. A PDF cannot be reopened as an editable planner, so keep JSON backups alongside any PDFs you want to retain.

## Save problems and recovery

If a save warning appears, keep the app open, download an editable JSON backup, and use **Retry save**. Closing before a save succeeds can lose the latest unsaved changes.

If stored data cannot be opened safely, use the recovery screen to download the raw recovery data before opening a known good JSON backup. Keep that recovery file for troubleshooting; it cannot be opened as an ordinary planner backup.

Do not clear website data to resolve an update problem: doing so removes the local planner. See [running, hosting, and updating](running-and-hosting.md) for the update procedure.
