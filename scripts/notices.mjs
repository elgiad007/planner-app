import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const seen = new Set(),
  notices = [];
async function packagePath(name, from) {
  const require = createRequire(from);
  try {
    return require.resolve(`${name}/package.json`);
  } catch {
    let folder = dirname(require.resolve(name));
    while (dirname(folder) !== folder) {
      const path = join(folder, "package.json");
      try {
        if (JSON.parse(await readFile(path, "utf8")).name === name) return path;
      } catch {}
      folder = dirname(folder);
    }
    throw Error(`Cannot locate license metadata for ${name}`);
  }
}
async function visit(path) {
  const pkg = JSON.parse(await readFile(path, "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  const folder = dirname(path);
  const files = (await readdir(folder)).filter((name) =>
    /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name),
  );
  const text = [];
  for (const name of files) {
    try {
      text.push(await readFile(join(folder, name), "utf8"));
    } catch {}
  }
  notices.push(
    `${key}\nLicense: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}\n${text.join("\n") || `Author: ${JSON.stringify(pkg.author ?? pkg.contributors ?? "See package source")}`}`,
  );
  for (const name of Object.keys(pkg.dependencies ?? {}))
    await visit(await packagePath(name, path));
  for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
    let optional;
    try {
      optional = await packagePath(name, path);
    } catch {
      continue;
    }
    await visit(optional);
  }
}
const root = resolve("package.json");
const pkg = JSON.parse(await readFile(root, "utf8"));
for (const name of Object.keys(pkg.dependencies))
  await visit(await packagePath(name, root));
await writeFile(
  "dist/third-party-notices.txt",
  "My Pastel Planner - production dependency notices\n\n" +
    notices.sort().join("\n\n" + "=".repeat(72) + "\n\n"),
);
console.log(`License notices: ${seen.size} production packages`);
