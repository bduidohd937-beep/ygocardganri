import JSZip from 'jszip';
import { validateCatalog } from './sharedCatalog';
import { validateBackup } from './logic';

/** Explicit allowlist: no cookies, auth credentials, local EDOPro files or unrelated browser databases. */
export const SNAPSHOT_FORMAT='YGO_STUDIO_SNAPSHOT_V1';
export const MAX_SNAPSHOT_BYTES=180*1024*1024;
export const MAX_RECORD_BYTES=55*1024*1024;
export const MAX_RECORDS=750;
export const SNAPSHOT_DATASETS=[
  {id:'studio',label:'스튜디오 카드 원장',db:'ygo_card_studio',store:'workspace',keyPath:null,local:null},
  {id:'cardmaker',label:'카드 렌더러 · 일러스트',db:'duelmind-card-studio',store:'projects',keyPath:null,local:null},
  {id:'cardmaker-assets',label:'렌더러 프레임·폰트 리소스',db:'duelmind-card-studio-assets',store:'packs',keyPath:null,local:null},
  {id:'designlab-files',label:'DESIGN LAB 원본 파일',db:'유희왕_DESIGN_LAB_자료실',store:'files',keyPath:'id',local:null},
  {id:'shared',label:'공통 카드·덱 보관함',db:null,store:null,keyPath:null,local:'ygo-studio-shared-catalog-v1'},
  {id:'artlab',label:'이미지 연구소 설정·카드 목록',db:null,store:null,keyPath:null,local:'ygo-art-lab-v1.1'},
  {id:'psh',label:'PSH 세션·검증 기록',db:null,store:null,keyPath:null,local:'psh-ai-arena-control-v1'},
  {id:'studio-fallback',label:'스튜디오 예비 원장',db:null,store:null,keyPath:null,local:'ygo_card_studio_local_v1'},
  {id:'designlab-decks',label:'DESIGN LAB 덱 조건 설정',db:null,store:null,keyPath:null,local:'design-lab:deck-openers:v1'}
] as const;
export type DatasetId=typeof SNAPSHOT_DATASETS[number]['id'];
type Dataset=typeof SNAPSHOT_DATASETS[number];
export type SnapshotRecord={dataset:DatasetId;key:string;path:string;sha256:string;bytes:number};
export type SnapshotBlob={path:string;sha256:string;bytes:number;type:string};
export type SnapshotManifest={format:typeof SNAPSHOT_FORMAT;createdAt:string;origin:string;records:SnapshotRecord[];blobs:SnapshotBlob[];warnings:string[]};
export type PackedSnapshot={manifest:SnapshotManifest;values:Array<{dataset:DatasetId;key:string;value:unknown}>};
export type RestorePreview={missing:number;existing:number;byDataset:Array<{id:DatasetId;label:string;missing:number;existing:number}>};
export type RestoreReport={added:number;skipped:number;failed:string[]};

const DSET=new Map<string,Dataset>(SNAPSHOT_DATASETS.map(x=>[x.id,x] as const));
function object(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x);}
function checkedKey(key:string){if(key.length>200||!key||key.includes('\u0000'))throw Error('백업 키가 올바르지 않습니다.');return key;}
async function sha256(bytes:Uint8Array):Promise<string>{
  if(!crypto?.subtle)throw Error('HTTPS 보안 연결에서만 SHA-256 백업을 만들 수 있습니다.');
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const bytes=(s:string)=>new TextEncoder().encode(s);
const decode=(b:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function requireBudget(size:number,limit:number,label:string){if(size>limit)throw Error(label+' 용량 제한을 초과합니다.');}
async function databaseExists(name:string):Promise<boolean>{
  if(typeof indexedDB.databases!=='function')return true;
  return (await indexedDB.databases()).some(db=>db.name===name);
}
function req<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('브라우저 저장소 요청 실패'));
});}
async function openExisting(def:Dataset):Promise<IDBDatabase|null>{
  if(!def.db||!def.store)return null;
  if(!(await databaseExists(def.db)))return null;
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(def.db);
    request.onupgradeneeded=()=>request.transaction?.abort();
    request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains(def.store!)){db.close();resolve(null);return;}resolve(db);};
    request.onerror=()=>reject(request.error||Error(def.label+' 저장소 읽기 실패'));
    request.onblocked=()=>reject(Error(def.label+' 저장소가 다른 탭에서 사용 중입니다.'));
  });
}
async function recordsIn(def:Dataset):Promise<Array<{dataset:DatasetId;key:string;value:unknown}>>{
  if(def.local){
    const value=localStorage.getItem(def.local);
    return value===null?[]:[{dataset:def.id,key:def.local,value}];
  }
  const db=await openExisting(def);
  if(!db)return [];
  try{
    const tx=db.transaction(def.store!,'readonly');
    const store=tx.objectStore(def.store!);
    const [keys,vals]=await Promise.all([req(store.getAllKeys()),req(store.getAll())]);
    return keys.map((key,i)=>({dataset:def.id,key:checkedKey(String(key)),value:vals[i]}));
  }finally{db.close();}
}
function validateValue(dataset:DatasetId,value:unknown):boolean{
  if(['studio','studio-fallback'].includes(dataset)){
    const val=typeof value==='string'?JSON.parse(value):value;
    return validateBackup(val);
  }
  if(dataset==='shared'){
    return typeof value==='string'&&validateCatalog(JSON.parse(value));
  }
  if(dataset==='artlab'){
    if(typeof value!=='string')return false;
    const x:unknown=JSON.parse(value);
    return object(x)&&Array.isArray(x.cards)&&x.cards.length<=400&&object(x.settings);
  }
  if(dataset==='psh'){
    if(typeof value!=='string')return false;
    const x:unknown=JSON.parse(value);
    return object(x)&&x.schemaVersion===1&&['sessions','events','tests','features','issues','protection'].every(k=>Array.isArray(x[k]));
  }
  if(dataset==='designlab-decks')return typeof value==='string'&&value.length<2000000;
  if(dataset==='cardmaker'){
    return object(value)&&Array.isArray(value.cards)&&value.cards.length<=2000&&typeof value.name==='string';
  }
  if(dataset==='cardmaker-assets'){
    return object(value)&&object(value.files)&&typeof value.importedAt==='string';
  }
  if(dataset==='designlab-files'){
    return object(value)&&typeof value.id==='string'&&typeof value.name==='string'&&typeof value.sha256==='string'&&value.blob instanceof Blob;
  }
  return false;
}
const marker='__YGO_STUDIO_BINARY_V1__';
type BMarker={__YGO_STUDIO_BINARY_V1__:string;mime:string;kind:'blob'|'buffer'};
function isMarker(x:unknown):x is BMarker{
  return object(x)&&typeof x[marker]==='string'&&typeof x.mime==='string'&&(x.kind==='blob'||x.kind==='buffer');
}
async function encodeValue(value:unknown,zip:JSZip,blobs:SnapshotBlob[],seen:WeakSet<object>,budget:{total:number}):Promise<unknown>{
  if(value instanceof Blob||value instanceof ArrayBuffer){
    const kind=value instanceof Blob?'blob':'buffer';
    const content=value instanceof Blob?new Uint8Array(await value.arrayBuffer()):new Uint8Array(value);
    requireBudget(content.byteLength,MAX_RECORD_BYTES,'원본 이미지·파일');
    budget.total+=content.byteLength;requireBudget(budget.total,MAX_SNAPSHOT_BYTES,'통합 백업');
    const path='blobs/'+String(blobs.length).padStart(5,'0')+'.bin';
    const mime=value instanceof Blob?value.type:'';
    blobs.push({path,sha256:await sha256(content),bytes:content.byteLength,type:mime});
    zip.file(path,content);
    return {[marker]:path,kind,mime} satisfies BMarker;
  }
  if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value!=='object')throw Error('지원하지 않는 저장 데이터가 있습니다.');
  if(seen.has(value))throw Error('순환 참조 데이터는 백업할 수 없습니다.');
  seen.add(value);
  try{
    if(Array.isArray(value))return Promise.all(value.map(v=>encodeValue(v,zip,blobs,seen,budget)));
    if(value instanceof Date)return {__YGO_STUDIO_DATE_V1__:value.toISOString()};
    const result:Record<string,unknown>={};
    for(const [k,v] of Object.entries(value))result[k]=await encodeValue(v,zip,blobs,seen,budget);
    return result;
  }finally{seen.delete(value);}
}
async function decodeValue(value:unknown,contents:Map<string,Uint8Array>,used:Set<string>):Promise<unknown>{
  if(isMarker(value)){
    const buffer=contents.get(value[marker]);if(!buffer)throw Error('백업의 바이너리 파일이 누락됐습니다.');
    used.add(value[marker]);
    return value.kind==='blob'?new Blob([new Uint8Array(buffer)],{type:value.mime}):new Uint8Array(buffer).buffer;
  }
  if(Array.isArray(value))return Promise.all(value.map(v=>decodeValue(v,contents,used)));
  if(object(value)){
    if(typeof value.__YGO_STUDIO_DATE_V1__==='string')return new Date(value.__YGO_STUDIO_DATE_V1__);
    const result:Record<string,unknown>={};
    for(const [k,v] of Object.entries(value))result[k]=await decodeValue(v,contents,used);
    return result;
  }
  return value;
}
export async function createSnapshot():Promise<{file:Blob;manifest:SnapshotManifest}>{
  const zip=new JSZip(),records:SnapshotRecord[]=[],blobs:SnapshotBlob[]=[];
  const warnings=['현재 github.io 출처의 저장소만 포함됩니다. 127.0.0.1 및 구형 URL은 별도 백업 필요.',
    '원본 보관함(ygo-studio-migration-v1)의 대용량 파일과 EDOPro/CDB/Lua 로컬 설치 파일은 별도 백업 대상입니다.',
    'ZIP은 암호화되지 않습니다. 개인 로그나 카드 원문은 안전한 장소에 보관하세요.'];
  const budget={total:0};
  for(const def of SNAPSHOT_DATASETS){
    const data=await recordsIn(def);
    for(const row of data){
      if(records.length>=MAX_RECORDS)throw Error('최대 750개 저장 항목을 초과했습니다.');
      if(!validateValue(row.dataset,row.value))throw Error(def.label+' 형식이 유효하지 않습니다. 기존 자료를 손상 없이 보존하려고 백업을 중단합니다.');
      const encoded=await encodeValue(row.value,zip,blobs,new WeakSet(),budget);
      const dataBytes=bytes(JSON.stringify({dataset:row.dataset,key:row.key,value:encoded}));
      requireBudget(dataBytes.byteLength,MAX_RECORD_BYTES,'백업 항목');
      budget.total+=dataBytes.byteLength;requireBudget(budget.total,MAX_SNAPSHOT_BYTES,'통합 백업');
      const path='records/'+String(records.length).padStart(5,'0')+'.json';
      zip.file(path,dataBytes);
      records.push({dataset:row.dataset,key:row.key,path,bytes:dataBytes.byteLength,sha256:await sha256(dataBytes)});
    }
  }
  if(!records.length)throw Error('저장된 작업 자료가 없습니다. 먼저 카드·덱 또는 관제 기록을 저장하세요.');
  const manifest:SnapshotManifest={format:SNAPSHOT_FORMAT,createdAt:new Date().toISOString(),origin:location.origin,records,blobs,warnings};
  zip.file('백업목록.json',JSON.stringify(manifest,null,2));
  const file=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
  return {file,manifest};
}
function validManifest(raw:unknown):raw is SnapshotManifest{
  return object(raw)&&raw.format===SNAPSHOT_FORMAT&&Array.isArray(raw.records)&&Array.isArray(raw.blobs)
    &&raw.records.length>0&&raw.records.length<=MAX_RECORDS&&raw.blobs.length<=MAX_RECORDS*4
    &&raw.records.every(r=>object(r)&&DSET.has(String(r.dataset))&&typeof r.key==='string'&&r.key.length<=200
      &&typeof r.path==='string'&&/^records\/\d{5}\.json$/.test(r.path)&&typeof r.sha256==='string'&&/^[0-9a-f]{64}$/.test(r.sha256)
      &&typeof r.bytes==='number'&&Number.isInteger(r.bytes)&&r.bytes>=0&&r.bytes<=MAX_RECORD_BYTES)
    &&raw.blobs.every(b=>object(b)&&typeof b.path==='string'&&/^blobs\/\d{5}\.bin$/.test(b.path)
      &&typeof b.sha256==='string'&&/^[0-9a-f]{64}$/.test(b.sha256)&&typeof b.type==='string'
      &&typeof b.bytes==='number'&&Number.isInteger(b.bytes)&&b.bytes>=0&&b.bytes<=MAX_RECORD_BYTES);
}
export async function inspectSnapshot(file:File):Promise<PackedSnapshot>{
  requireBudget(file.size,MAX_SNAPSHOT_BYTES,'ZIP 파일');
  const zip=await JSZip.loadAsync(file,{checkCRC32:true});
  const manifestText=await zip.file('백업목록.json')?.async('string');
  if(!manifestText||manifestText.length>1024*1024)throw Error('백업목록.json이 없거나 너무 큽니다.');
  const manifest:unknown=JSON.parse(manifestText);
  if(!validManifest(manifest))throw Error('YGO STUDIO V2.7 통합 백업 형식이 아닙니다.');
  const allPaths=['백업목록.json',...manifest.records.map(x=>x.path),...manifest.blobs.map(x=>x.path)];
  if(new Set(allPaths).size!==allPaths.length)throw Error('백업 파일 경로가 중복됐습니다.');
  if(Object.keys(zip.files).some(path=>!allPaths.includes(path)&&!path.endsWith('/')))throw Error('등록되지 않은 파일이 들어 있는 ZIP입니다.');
  let total=0;
  const getVerified=async(item:{path:string;sha256:string;bytes:number})=>{
    const raw=await zip.file(item.path)?.async('uint8array');
    if(!raw||raw.byteLength!==item.bytes||await sha256(raw)!==item.sha256)throw Error('SHA-256 검증 실패: '+item.path);
    total+=raw.byteLength;requireBudget(total,MAX_SNAPSHOT_BYTES,'백업 해제 내용');
    return raw;
  };
  const contents=new Map<string,Uint8Array>();
  for(const blob of manifest.blobs)contents.set(blob.path,await getVerified(blob));
  const values:PackedSnapshot['values']=[];
  const used=new Set<string>();
  for(const entry of manifest.records){
    const raw=JSON.parse(decode(await getVerified(entry))) as unknown;
    if(!object(raw)||raw.dataset!==entry.dataset||raw.key!==entry.key)throw Error('레코드 메타데이터가 일치하지 않습니다.');
    const def=DSET.get(entry.dataset)!;
    if(def.local&&entry.key!==def.local)throw Error('허용되지 않은 localStorage 키입니다.');
    const value=await decodeValue(raw.value,contents,used);
    if(!validateValue(entry.dataset,value))throw Error(def.label+' 데이터 형식이 유효하지 않습니다.');
    values.push({dataset:entry.dataset,key:entry.key,value});
  }
  if(used.size!==contents.size)throw Error('사용되지 않은 바이너리 항목이 있어 복원을 차단했습니다.');
  return {manifest,values};
}
async function hasStoredValue(def:Dataset,key:string):Promise<boolean>{
  if(def.local)return localStorage.getItem(def.local)!==null;
  const db=await openExisting(def);
  if(!db)return false;
  try{
    const r=await req(db.transaction(def.store!,'readonly').objectStore(def.store!).getKey(def.keyPath?key:key));
    return r!==undefined;
  }finally{db.close();}
}
export async function previewRestore(snapshot:PackedSnapshot):Promise<RestorePreview>{
  const counters=new Map<DatasetId,{missing:number;existing:number}>();
  let missing=0,existing=0;
  for(const entry of snapshot.values){
    const def=DSET.get(entry.dataset)!;
    const exists=await hasStoredValue(def,entry.key);
    const count=counters.get(entry.dataset)||{missing:0,existing:0};
    if(exists){count.existing++;existing++;}else{count.missing++;missing++;}
    counters.set(entry.dataset,count);
  }
  return {missing,existing,byDataset:SNAPSHOT_DATASETS.filter(d=>counters.has(d.id)).map(d=>({id:d.id,label:d.label,...counters.get(d.id)!}))};
}
async function openForRestore(def:Dataset):Promise<IDBDatabase>{
  if(!def.db||!def.store)throw Error('데이터베이스 정의 오류');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(def.db,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(def.store!))db.createObjectStore(def.store!,def.keyPath?{keyPath:def.keyPath}:undefined);
    };
    request.onsuccess=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(def.store!)){db.close();reject(Error(def.label+' 저장소 구조를 찾을 수 없습니다.'));return;}
      resolve(db);
    };
    request.onerror=()=>reject(request.error||Error(def.label+' 복원 저장소 열기 실패'));
    request.onblocked=()=>reject(Error(def.label+' 저장소를 사용하는 다른 탭을 닫아 주세요.'));
  });
}
async function addIfAbsent(def:Dataset,key:string,value:unknown):Promise<boolean>{
  if(def.local){if(localStorage.getItem(def.local)!==null)return false;localStorage.setItem(def.local,value as string);return true;}
  const db=await openForRestore(def);
  try{
    return await new Promise<boolean>((resolve,reject)=>{
      const tx=db.transaction(def.store!,'readwrite'),store=tx.objectStore(def.store!);
      let added=false;
      const get=store.getKey(key);
      get.onsuccess=()=>{
        if(get.result!==undefined)return;
        const put=def.keyPath?store.add(value):store.add(value,key);
        put.onsuccess=()=>{added=true;};
        put.onerror=()=>reject(put.error||Error('신규 저장 실패'));
      };
      get.onerror=()=>reject(get.error||Error('중복 검사 실패'));
      tx.oncomplete=()=>resolve(added);
      tx.onerror=()=>reject(tx.error||Error('복원 트랜잭션 실패'));
      tx.onabort=()=>reject(tx.error||Error('복원 중단'));
    });
  }finally{db.close();}
}
export async function restoreMissingOnly(snapshot:PackedSnapshot,selected:DatasetId[]):Promise<RestoreReport>{
  if(!selected.length)throw Error('복원할 작업실을 선택하세요.');
  const allowed=new Set(selected),report:RestoreReport={added:0,skipped:0,failed:[]};
  for(const entry of snapshot.values){
    if(!allowed.has(entry.dataset))continue;
    try{
      const def=DSET.get(entry.dataset)!;
      if(def.keyPath&&(!object(entry.value)||String(entry.value[def.keyPath])!==entry.key))throw Error('파일 ID 불일치');
      if(await addIfAbsent(def,entry.key,entry.value))report.added++;
      else report.skipped++;
    }catch(e){report.failed.push(entry.dataset+'/'+entry.key+': '+String(e));}
  }
  return report;
}
