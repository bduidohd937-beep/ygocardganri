#!/usr/bin/env node
/**
 * Build ESM from original DESIGN LAB entry modules.
 * The document/window accessors are scoped at runtime; original source stays intact.
 */
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, statSync } from 'node:fs';

const source=resolve('.integration_sources/designlab');
const out=resolve('dist/modules/designlab');
const entries=['main.js','audit-ui.js','layout.js','storage-ui.js','audit-split.js','deck-lab-ui.js'];
for(const name of entries)if(!existsSync(resolve(source,'src',name)))throw Error('Missing DESIGN LAB source: '+name);
mkdirSync(out,{recursive:true});
const entry=entries.map(n=>"import './src/"+n+"';").join('\n');
await build({
  stdin:{contents:entry,resolveDir:source,sourcefile:'native-designlab-entry.js',loader:'js'},
  bundle:true,platform:'browser',format:'esm',target:['es2020'],
  outfile:resolve(out,'native-designlab.js'),
  minify:false,sourcemap:false,
  define:{document:'__YGO_LAB_CONTEXT__.document',window:'__YGO_LAB_CONTEXT__.window'},
  banner:{js:"const __YGO_LAB_CONTEXT__ = globalThis.__YGO_LAB_CONTEXT__; if (!__YGO_LAB_CONTEXT__) throw new Error('DESIGN LAB native mount context is missing');"}
});
const size=statSync(resolve(out,'native-designlab.js')).size;
if(size<25000||size>1200000)throw Error('Unexpected native bundle size: '+size);
console.log('[designlab] Native ESM generated: '+size+' bytes; original code unchanged');
