#!/usr/bin/env node
// The single-file PSH UI is compiled without evaluating source strings or editing the upstream app.
// Keep the original independent index.html alongside the native module as a fallback.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=readFileSync(resolve('.integration_sources/arena/index.html'),'utf8');
const styles=[...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const body=source.match(/<body\b[^>]*>([\s\S]*?)<script\b/i);
if(styles.length!==1||scripts.length!==1||!body)throw Error('PSH 원본 구조가 바뀌었습니다. 네이티브 빌드 중단');
const css=styles[0][1];
const js=scripts[0][1];
if(!/function render\(/.test(js)||!js.includes("psh-ai-arena-control-v1")||!body[1].includes('id="nav"')||!body[1].includes('id="modalRoot"'))
  throw Error('원본 관제실의 필수 진입점이 없습니다.');
const out=resolve('dist/modules/arena');
mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'native-arena.html'),body[1],'utf8');
writeFileSync(resolve(out,'native-arena.css'),css,'utf8');
writeFileSync(resolve(out,'native-arena.js'),
  "// PSH original script, scoped at runtime to the mounted ShadowRoot.\n"+
  "export function mountArena(document){\n"+
  js+
  "\n}\n",'utf8');
console.log('[PSH] native files generated from pinned original: '+js.length+' JS / '+css.length+' CSS bytes');
