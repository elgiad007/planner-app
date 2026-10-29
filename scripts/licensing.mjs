import {
  copyFile,
  lstat,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { gzipSync } from "node:zlib";

// An explicit source list keeps local backups, credentials, Git metadata, and
// build outputs out of the public archive. Include working files, not just HEAD.
const roots = [
  "src",
  "scripts",
  "tests",
  "public",
  "doc",
  "patches",
  "LICENSE",
  "COPYRIGHT",
  "README.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "index.html",
  "update-release.cmd",
  "start-test-server.cmd",
];
const entries = [];
async function collect(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink())
    throw Error(`Source symlinks are not supported: ${path}`);
  if (info.isDirectory()) {
    for (const name of (await readdir(path)).sort())
      await collect(`${path}/${name}`);
  } else entries.push(path);
}
for (const path of roots) await collect(path);

// POSIX ustar archive using only Node built-ins, so source builds also work
// without a system tar installation or an additional archive dependency.
const blocks = [];
for (const path of entries) {
  const data = await readFile(path);
  const header = Buffer.alloc(512);
  const name = `my-pastel-planner/${path}`;
  if (Buffer.byteLength(name) > 100)
    throw Error(`Source path too long: ${path}`);
  header.write(name, 0, 100);
  function octal(value, offset, length) {
    const digits = value.toString(8);
    if (digits.length >= length) throw Error(`Archive field overflow: ${path}`);
    header.write(digits.padStart(length - 1, "0") + "\0", offset, length);
  }
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(data.length, 124, 12);
  octal(0, 136, 12);
  header.fill(32, 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
}
blocks.push(Buffer.alloc(1024));
await writeFile("dist/source.tar.gz", gzipSync(Buffer.concat(blocks)));
await copyFile("LICENSE", "dist/LICENSE.txt");
await copyFile("COPYRIGHT", "dist/COPYRIGHT.txt");
console.log(`GPL license and matching source: ${entries.length} files`);
