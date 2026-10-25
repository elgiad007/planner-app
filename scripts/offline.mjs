import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

// Generate self-contained PNG icons without a remote font or image dependency.
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    n = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, sum]);
}
function icon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      let color = [231, 215, 235];
      const nx = x / size,
        ny = y / size;
      if (nx > 0.14 && nx < 0.86 && ny > 0.19 && ny < 0.81)
        color = [174, 146, 174];
      if (
        ((nx > 0.18 && nx < 0.48) || (nx > 0.52 && nx < 0.82)) &&
        ny > 0.23 &&
        ny < 0.77
      )
        color = [255, 251, 241];
      if (nx > 0.22 && nx < 0.78 && Math.abs(ny - 0.36) < 0.008)
        color = [202, 182, 207];
      if (
        nx > 0.22 &&
        nx < 0.78 &&
        ny > 0.43 &&
        ny < 0.7 &&
        Math.abs((ny - 0.43) % 0.065) < 0.005
      )
        color = [218, 207, 214];
      if (
        nx > 0.46 &&
        nx < 0.54 &&
        [0.32, 0.39, 0.46, 0.59, 0.66, 0.73].some(
          (v) => Math.abs(ny - v) < 0.012,
        )
      )
        color = [142, 145, 152];
      const i = row + 1 + x * 4;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const size of [192, 512])
  await writeFile(`dist/icon-${size}.png`, icon(size));
await writeFile(
  "dist/manifest.webmanifest",
  JSON.stringify({
    id: "/",
    name: "My Pastel Planner",
    short_name: "Pastel Planner",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#f0ebef",
    theme_color: "#ece5ef",
    icons: [192, 512].map((s) => ({
      src: `/icon-${s}.png`,
      sizes: `${s}x${s}`,
      type: "image/png",
      purpose: "any maskable",
    })),
  }),
);
async function files(dir, prefix = "") {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory())
      result.push(...(await files(`${dir}/${e.name}`, `${prefix}${e.name}/`)));
    else result.push(`${prefix}${e.name}`);
  }
  return result;
}
const paths = (await files("dist")).filter(
  (p) => p !== "sw.js" && p !== ".htaccess",
);
const hash = createHash("sha256");
for (const p of paths) hash.update(await readFile(`dist/${p}`));
const version = hash.digest("hex").slice(0, 16);
await writeFile(
  "dist/sw.js",
  `const CACHE='pastel-${version}';const ASSETS=${JSON.stringify(paths.map((p) => "/" + p))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pastel-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')).then(cached=>cached||fetch(event.request)));return;}if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(event.request)));});
`,
);
console.log(`Offline bundle: ${paths.length} files, version ${version}`);
