import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const [source, target] of [['site/index.html', 'index.html'], ['site/favicon.svg', 'favicon.svg'], ['site/_headers', '_headers'], ['app.js', 'app.js']]) {
  await cp(new URL(source, root), new URL(target, dist));
}
console.log(`Built static site: ${fileURLToPath(dist)}`);
