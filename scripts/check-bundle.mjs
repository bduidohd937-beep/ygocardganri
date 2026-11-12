import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// User-facing startup bundle and optional ZIP/SQLite worker have different budgets.
const files = readdirSync('dist/assets');
const html = readFileSync('dist/index.html','utf8');
const entry = html.match(/assets\/(index-[^"']+\.js)/)?.[1];
if (!entry || !files.includes(entry)) throw new Error('Missing Vite entry JavaScript');
const gzip = file => gzipSync(readFileSync(`dist/assets/${file}`)).byteLength;
const entryBytes=gzip(entry);
const lazyFiles=files.filter(f=>f.endsWith('.js') && f!==entry);
const lazyBytes=lazyFiles.reduce((n,f)=>n+gzip(f),0);
const cssFiles=files.filter(f=>f.endsWith('.css'));
const cssBytes=cssFiles.reduce((n,f)=>n+gzip(f),0);
const entryCss=html.match(/assets\\/(index-[^"']+\\.css)/)?.[1];
if(!entryCss||!cssFiles.includes(entryCss)) throw new Error('Missing Vite entry stylesheet');
const initialCssBytes=gzip(entryCss);
const wasmFiles=files.filter(f=>f.endsWith('.wasm'));
const wasmTotal=wasmFiles.reduce((n,f)=>n+readFileSync(`dist/assets/${f}`).byteLength,0);
const budgets=[['초기 JS',entryBytes,150*1024],['옵션 파서 JS',lazyBytes,500*1024],['초기 CSS',initialCssBytes,20*1024],['전체 CSS',cssBytes,24*1024],['WASM',wasmTotal,1.5*1024*1024]];
for (const [label,amount,max] of budgets) {
 console.log(`[P2] ${label}: ${(amount/1024).toFixed(1)} KiB / budget ${(max/1024).toFixed(1)} KiB`);
 if (amount>max) throw new Error(`${label} asset size exceeds budget`);
}
if(!cssFiles.length)throw new Error('Missing CSS');