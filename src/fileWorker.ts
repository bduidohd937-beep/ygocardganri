/// <reference lib="webworker" />
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { parseLua, parseYdk, passcodeFromName } from './fileCatalog';
import type { PreviewAsset, AssetKind } from './fileCatalog';

const MAX_SOURCE = 25 * 1024 * 1024;
const MAX_ENTRY = 12 * 1024 * 1024;
const MAX_TOTAL = 60 * 1024 * 1024;
const MAX_ENTRIES = 500;
const utf8 = new TextDecoder('utf-8');
type WorkerRequest = { command: 'parse'; files: File[] };
type WorkerMessage =
  | { type: 'progress'; completed: number; total: number; filename: string }
  | { type: 'done'; batch: {entries: PreviewAsset[]; errors: string[]; skipped: number} }
  | { type: 'error'; message: string };
const say = (message: WorkerMessage, transfers?: Transferable[]) => self.postMessage(message, { transfer: transfers || [] });

function validPath(name: string): boolean {
  if (!name || name.length > 300 || name.includes('\0') || name.startsWith('/') || name.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(name) || name.includes('\\')) return false;
  const parts = name.split('/');
  return parts.every(part => part && part !== '..' && part !== '.') && !parts.some(p => p === '__MACOSX');
}
function detectKind(filename: string): AssetKind | null {
  if (/\.cdb$/i.test(filename)) return 'CDB';
  if (/\.lua$/i.test(filename)) return 'Lua';
  if (/\.(png|jpe?g|webp)$/i.test(filename)) return '이미지';
  if (/\.ydk$/i.test(filename)) return 'YDK';
  if (/\.zip$/i.test(filename)) return 'ZIP';
  return null;
}
function validateSignature(kind: AssetKind, bytes: Uint8Array): string | null {
  if (kind === 'CDB' && utf8.decode(bytes.slice(0,16)) !== 'SQLite format 3\0') return '유효한 SQLite CDB 파일 헤더가 아닙니다.';
  if (kind === '이미지') {
    const png= bytes.length>=8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    const jpg= bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const webp=bytes.length>=12 && utf8.decode(bytes.slice(0,4))==='RIFF' && utf8.decode(bytes.slice(8,12))==='WEBP';
    if(!png&&!jpg&&!webp)return '이미지(PNG/JPEG/WebP) 파일 시그니처가 올바르지 않습니다.';
  }
  return null;
}
function safeCode(value:unknown):string|null {
  const n=typeof value==='bigint'?Number(value):Number(value);
  return Number.isSafeInteger(n)&&n>0?String(n):null;
}
async function parseCdb(bytes:Uint8Array): Promise<{cards:PreviewAsset['cards']; notes:string[]}> {
  const SQL=await initSqlJs({ locateFile:()=>wasmUrl });
  const db=new SQL.Database(bytes);
  try {
    const tables=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('datas','texts')");
    const existing=new Set((tables[0]?.values||[]).map(row=>String(row[0])));
    if(!existing.has('datas')||!existing.has('texts'))throw new Error('datas/texts 테이블이 없습니다.');
    const count = db.exec('SELECT COUNT(*) FROM datas')[0]?.values[0]?.[0];
    if(Number(count)>25000)throw new Error('CDB 카드 25,000장 상한 초과');
    const rows=db.exec('SELECT d.id AS passcode, t.name AS name, t."desc" AS effect FROM datas d LEFT JOIN texts t ON d.id=t.id LIMIT 25001');
    const cards:PreviewAsset['cards']=[];
    let blanks=0;
    for(const row of rows[0]?.values||[]) {
      const passcode=safeCode(row[0]); if(!passcode){blanks++;continue;}
      cards.push({passcode,name:String(row[1]??''),effectText:String(row[2]??'')});
    }
    const notes=[];
    if(blanks)notes.push(`${blanks}개 카드 ID를 읽지 못했습니다.`);
    if(cards.some(c=>!c.name))notes.push('일부 카드명이 비어 있습니다. 원문은 미확인 상태로 유지됩니다.');
    return {cards, notes};
  } finally {db.close();}
}
async function makeAsset(path:string, bytes: Uint8Array, source:'직접'|'ZIP'):Promise<PreviewAsset|null>{
  const filename=path.split('/').at(-1)||path;
  const kind=detectKind(filename); if(!kind)return null;
  if(bytes.byteLength>MAX_ENTRY&&source==='ZIP')throw new Error(`${path}: ZIP 내부 파일 12MB 초과`);
  const err=validateSignature(kind,bytes);if(err)throw new Error(`${path}: ${err}`);
  const notes:string[]=[];let cards:PreviewAsset['cards']=[];
  let deck:PreviewAsset['deck']; let cardId=passcodeFromName(filename);
  if(kind==='CDB'){
    const r=await parseCdb(bytes);cards=r.cards;notes.push(...r.notes);cardId=null;
  }else if(kind==='Lua'){
    const r=parseLua(utf8.decode(bytes),filename);cardId=r.cardId;notes.push(...r.warnings);
  }else if(kind==='YDK'){
    const r=parseYdk(utf8.decode(bytes));notes.push(...r.warnings);deck={main:r.main,extra:r.extra,side:r.side};cardId=null;
  }else if(!cardId){notes.push('이미지 파일명에 카드 ID가 없어 자동 연결할 수 없습니다.');}
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  const copy=bytes.slice().buffer as ArrayBuffer;
  return {kind,filename,path,cardId,sha256,size:bytes.length,source,notes,cards,deck,bytes:copy};
}

async function parseFiles(files:File[]) {
  if(files.length>MAX_ENTRIES)throw new Error(`한 번에 최대 ${MAX_ENTRIES}개 파일만 가져올 수 있습니다.`);
  let totalBytes=0;
  const entries:PreviewAsset[]=[]; const errors:string[]=[];let skipped=0;let completed=0;
  const progress=(filename:string,total:number)=>say({type:'progress',completed:++completed,total,filename});
  for(const file of files){
    if(file.size>MAX_SOURCE){errors.push(`${file.name}: 파일 25MB 초과`);progress(file.name,files.length);continue;}
    const buffer=new Uint8Array(await file.arrayBuffer());
    if(/\.zip$/i.test(file.name)) {
      try {
        // JSZip only parses archive metadata here. All extraction takes place in a terminate-able worker.
        const JSZip=(await import('jszip')).default;
        const archive=await JSZip.loadAsync(buffer,{checkCRC32:false,createFolders:false});
        const items=Object.values(archive.files).filter(item=>!item.dir);
        if(items.length>MAX_ENTRIES)throw new Error('ZIP 내부 파일 수가 500개를 넘습니다.');
        let archiveSize=0;
        for(const item of items) {
          const original=(item as typeof item & {unsafeOriginalName?:string}).unsafeOriginalName || item.name;
          if(!validPath(original) || original!==item.name){errors.push(`${file.name}: 위험하거나 수정된 ZIP 경로 거부 (${original})`);continue;}
          const kind=detectKind(item.name);if(!kind){skipped++;continue;}
          // Metadata preflight before decompression (JSZip does not publicly expose sizes).
          const meta=item as typeof item & {_data?:{uncompressedSize?:number;compressedSize?:number}};
          const u=meta._data?.uncompressedSize;const c=meta._data?.compressedSize;
          if(!Number.isFinite(u)||!Number.isFinite(c)||u!<0||u!>MAX_ENTRY){errors.push(`${item.name}: 압축 해제 예상 크기 초과/미확인`);continue;}
          if(u!>1048576 && (c||0)<u!/200){errors.push(`${item.name}: 비정상적인 압축률`);continue;}
          archiveSize+=u!;if(archiveSize>MAX_TOTAL)throw new Error('ZIP 총 해제 용량 60MB 초과');
          try {
            const content=await item.async('uint8array');
            if(content.length>MAX_ENTRY)throw new Error('압축 해제 후 크기 초과');
            totalBytes+=content.length;if(totalBytes>MAX_TOTAL)throw new Error('업로드 전체 허용 용량 60MB 초과');
            const parsed=await makeAsset(item.name,content,'ZIP');if(parsed)entries.push(parsed);
          }catch(e){errors.push(`${item.name}: ${e instanceof Error?e.message:String(e)}`);}
        }
        totalBytes+=buffer.length;if(totalBytes>MAX_TOTAL)throw new Error('업로드 전체 허용 용량 60MB 초과');
        const original=await makeAsset(file.name,buffer,'직접');if(original)entries.push(original);
      }catch(e){errors.push(`${file.name}: ZIP 파싱 실패: ${e instanceof Error?e.message:String(e)}`);}
    } else {
      try {
        totalBytes+=buffer.length;if(totalBytes>MAX_TOTAL)throw new Error('업로드 전체 허용 용량 60MB 초과');
        const parsed=await makeAsset(file.name,buffer,'직접');if(parsed)entries.push(parsed);else skipped++;
      }catch(e){errors.push(`${file.name}: ${e instanceof Error?e.message:String(e)}`);}
    }
    progress(file.name,files.length);
  }
  const batch={entries,errors,skipped};
  const transfers=entries.map(e=>e.bytes);
  say({type:'done',batch},transfers);
}
self.onmessage = (event:MessageEvent<WorkerRequest>)=>{
  if(event.data.command!=='parse')return;
  void parseFiles(event.data.files).catch(e=>say({type:'error',message:e instanceof Error?e.message:String(e)}));
};