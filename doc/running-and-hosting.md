# Running, hosting, and updating

## Install and use the planner

Open the hosted planner's HTTPS address in your browser. On iPad, use Safari and choose **Share → Add to Home Screen** (enable **Open as Web App** if offered).

Open the installed app online once and wait for **offline app ready**. Close and reopen it in Airplane Mode to confirm offline access before relying on it without a connection. A Safari tab and an installed Home Screen app may have separate storage.

Use Apple Pencil or a mouse to write. Enable **Finger writing** for a finger or touch stylus; leave it off when using Apple Pencil to help prevent palm marks. Month tabs and arrows navigate the binder, and **Browse dates** lets you tap calendar dates. See the [app overview](../README.md) and [keyboard shortcuts](keyboard-shortcuts.md) for more controls.

**Planner content stays on your device.** The hosting service serves app files and updates, but does not store your handwriting, text, stamps, or settings. Keep regular [editable JSON backups](data-storage.md); there is no server copy to restore.

## Prepare the hosting files

If you already have a release ZIP, continue to the upload instructions below.

To create a hosting package from this repository, install Node.js (22.12+ or 24+) and pnpm 11, then run these commands in the repository folder:

```sh
pnpm install --frozen-lockfile
pnpm build
```

The finished website is in `dist/`.

On Windows, you can instead double-click `update-release.cmd` after installing dependencies. It builds the website and creates `release/my-pastel-planner-v<version>.zip`, using the app version for the filename. Review the result before closing the window. The command packages the files; it does not upload them.

## Upload to your hosting service

1. Choose the domain or subdomain where you want to host the planner. Enable HTTPS and redirect HTTP to HTTPS using your hosting provider's settings.
2. Upload the **contents** of `dist/`, or upload and extract the release ZIP, into the document root assigned to that domain or subdomain. Use your provider's file manager, SFTP, or deployment tool.
3. Include hidden files. In cPanel File Manager, enable **Show Hidden Files** in Settings. Ensure `index.html`, `sw.js`, `.htaccess`, icons, `manifest.webmanifest`, and `assets/` are directly in the document root, not inside `dist/` or another subfolder.
4. Visit your planner's HTTPS address and follow the installation instructions above.

The app runs as a static website. No Node process, PHP scripts, server database, or account service is needed. The build is intended for a domain or subdomain root, not a subdirectory.

Keep the generated `LICENSE.txt`, `COPYRIGHT.txt`, `source.tar.gz`, and
`third-party-notices.txt` with the hosted files. The source archive matches
that exact build. The archive includes project source, dependency lockfile,
patches, and build instructions; dependencies are installed using pnpm. If you
modify the app, rebuild and publish the matching archive with it. Keep notices
intact and document your changes and their dates when distributing modified versions.

Do not upload loose development files, `node_modules`, Git metadata, or personal
JSON backups. The generated source archive is intended for public distribution.

The included `.htaccess` configures Apache hosting. If the server rejects it, check Apache overrides with your host. On other hosting services, configure equivalent MIME types and no-cache handling for `index.html`, `manifest.webmanifest`, and `sw.js` using the provider's settings. Keep `third-party-notices.txt` with the hosted files for dependency license notices.

## Install an app update

Open **Help → Check for updates** beside the version number. This requires an internet connection. Checking does not reload the app or install an update immediately.

When an update is available, use **Back up and update**. Retain the downloaded JSON backup and confirm before installing. Do not clear website data to force an update: that removes your planner.

## Publish an updated hosting package

Before replacing hosted app files, save an editable JSON backup of your planner. Upload all new files together, retaining old hashed assets during the transition so already-open copies can finish using them. Then open the app online and follow its **Back up and update** prompt after pending saves finish.

Changing the domain, protocol, or port changes the browser storage location. Use **Save planner…** at the old address and **Open planner…** at the new address to transfer your content manually. Updating app files at the same address does not require clearing planner storage.
