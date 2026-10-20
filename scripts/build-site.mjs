import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// The hosted site is self-contained in site/; the bookmarklet's app.js is not shipped.
for (const file of ['index.html', 'styles.css', 'lib.mjs', 'main.mjs', 'favicon.svg', '_headers']) {
  await cp(new URL(`site/${file}`, root), new URL(file, dist));
}
console.log(`Built static site: ${fileURLToPath(dist)}`);
