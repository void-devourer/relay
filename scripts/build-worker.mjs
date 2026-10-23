import { build } from 'esbuild';
import { readFile, readdir, mkdir, cp } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
const root = process.cwd(), directory = resolve(root, 'dist');
const assets = {};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ics': 'text/calendar; charset=utf-8' };
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'server' || entry.name === '.openai') continue;
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await collect(full);
    else assets['/' + relative(directory, full).replaceAll('\\', '/')] = { body: await readFile(full, 'utf8'), type: mime[extname(full)] ?? 'text/plain' };
  }
}
await collect(directory);
await mkdir(resolve(directory, 'server'), { recursive: true });
await mkdir(resolve(directory, '.openai'), { recursive: true });
await cp(resolve(root, '.openai/hosting.json'), resolve(directory, '.openai/hosting.json'));
await cp(resolve(root, 'drizzle'), resolve(directory, '.openai/drizzle'), { recursive: true });
await build({ entryPoints: ['worker/index.mjs'], outfile: 'dist/server/index.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, define: { RELAY_ASSETS: JSON.stringify(assets) }, external: ['node:async_hooks'] });
console.log(`Worker built with ${Object.keys(assets).length} embedded assets and D1 migrations.`);
