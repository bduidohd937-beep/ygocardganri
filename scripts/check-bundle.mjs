import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = { '.js': 115 * 1024, '.css': 16 * 1024 };
const files = readdirSync('dist/assets');
for (const [extension, maxGzip] of Object.entries(budgets)) {
  const bundle = files.filter(f => f.endsWith(extension));
  if (!bundle.length) throw new Error(`Missing ${extension} production assets`);
  const total = bundle.reduce((bytes, file) => bytes + gzipSync(readFileSync(`dist/assets/${file}`)).byteLength, 0);
  console.log(`[P0.5] ${extension} total gzip ${(total / 1024).toFixed(1)} KiB / budget ${(maxGzip/1024).toFixed(1)} KiB`);
  if (total > maxGzip) throw new Error(`${extension} asset gzip total exceeds budget`);
}