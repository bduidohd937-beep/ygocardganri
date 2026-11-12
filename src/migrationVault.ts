import type { MigrationInspection,BackupKind } from './migrationModel';
import { MIGRATION_LIMITS } from './migrationModel';

export type MigrationEntry = {
  hash:string;
  name:string;
  type:string;
  bytes:number;
  kind:BackupKind;
  label:string;
  count:number|null;
  note:string;
  canMergeMetadata:boolean;
  importedAt:string;
  userCheckedAt:string|null;
};
export type StoredBackup={hash:string;blob:Blob};
const DB_NAME='ygo-studio-migration-v1';
const DB_VERSION=1;
const META='metadata',FILES='original_files';
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(META))req.result.createObjectStore(META,{keyPath:'hash'});
      if(!req.result.objectStoreNames.contains(FILES))req.result.createObjectStore(FILES,{keyPath:'hash'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('원본 보관함을 열 수 없습니다.'));
    req.onblocked=()=>reject(Error('다른 탭이 원본 보관함을 사용 중입니다. 다른 YGO STUDIO 탭을 닫아 주세요.'));
  });
}
function transactionDone(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||Error('저장 트랜잭션이 중단됐습니다.'));
    tx.onerror=()=>reject(tx.error||Error('저장 트랜잭션 오류'));
  });
}
function txRequest<T>(req:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('데이터 읽기 오류'));
  });
}
export async function hashFile(file:Blob):Promise<string>{
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 지원 HTTPS 환경에서만 원본을 검증할 수 있습니다.');
  if(file.size>MIGRATION_LIMITS.fileBytes)throw Error('단일 파일은 40MiB까지 가져올 수 있습니다.');
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function listMigrationEntries():Promise<MigrationEntry[]>{
  const db=await database();
  try{
    const tx=db.transaction(META,'readonly');
    const items=await txRequest(tx.objectStore(META).getAll() as IDBRequest<MigrationEntry[]>);
    return items.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));
  }finally{db.close();}
}
export async function fetchMigrationEntry(hash:string):Promise<MigrationEntry|null>{
  const db=await database();
  try{
    const tx=db.transaction(META,'readonly');
    return await txRequest(tx.objectStore(META).get(hash) as IDBRequest<MigrationEntry|undefined>)??null;
  }finally{db.close();}
}
export async function fetchOriginal(hash:string):Promise<Blob>{
  const db=await database();
  try{
    const tx=db.transaction(FILES,'readonly');
    const item=await txRequest(tx.objectStore(FILES).get(hash) as IDBRequest<StoredBackup|undefined>);
    if(!item||!(item.blob instanceof Blob))throw Error('저장된 원본 파일이 없습니다. 저장 기록이 손상됐을 수 있습니다.');
    return item.blob;
  }finally{db.close();}
}
export async function verifyOriginal(hash:string):Promise<boolean>{
  const blob=await fetchOriginal(hash);
  return (await hashFile(blob))===hash;
}
export async function saveOriginal(file:File,inspection:MigrationInspection,hash?:string):Promise<{entry:MigrationEntry;duplicate:boolean}>{
  if(inspection.blocked)throw Error('손상된 데이터는 보관함에 정상 백업으로 등록할 수 없습니다.');
  if(file.size>MIGRATION_LIMITS.fileBytes)throw Error('단일 파일 용량 제한을 초과했습니다.');
  const computed=await hashFile(file);
  if(hash && hash!==computed)throw Error('파일 내용이 사전 검사와 달라졌습니다. 다시 선택하세요.');
  const db=await database();
  try{
    const exists=await txRequest(db.transaction(META,'readonly').objectStore(META).get(computed) as IDBRequest<MigrationEntry|undefined>);
    if(exists)return {entry:exists,duplicate:true};
    const entry:MigrationEntry={
      hash:computed,name:file.name,type:file.type||'application/octet-stream',bytes:file.size,
      kind:inspection.kind,label:inspection.label,count:inspection.count,note:inspection.note,
      canMergeMetadata:inspection.canMergeMetadata,importedAt:new Date().toISOString(),userCheckedAt:null
    };
    const tx=db.transaction([META,FILES],'readwrite');
    const done=transactionDone(tx);
    tx.objectStore(META).add(entry);
    tx.objectStore(FILES).add({hash:computed,blob:file} satisfies StoredBackup);
    await done;
    return {entry,duplicate:false};
  }finally{db.close();}
}
export async function markEntryChecked(hash:string,checked:boolean):Promise<void>{
  const db=await database();
  try{
    const entry=await txRequest(db.transaction(META,'readonly').objectStore(META).get(hash) as IDBRequest<MigrationEntry|undefined>);
    if(!entry)throw Error('원본 기록을 찾지 못했습니다.');
    const next={...entry,userCheckedAt:checked?new Date().toISOString():null};
    const tx=db.transaction(META,'readwrite'),done=transactionDone(tx);
    tx.objectStore(META).put(next);
    await done;
  }finally{db.close();}
}
export async function buildMigrationManifest(entries:MigrationEntry[]):Promise<string>{
  return JSON.stringify({
    app:'YGO STUDIO 이전 원본 보관함',schemaVersion:1,
    createdAt:new Date().toISOString(),note:'원본 파일은 ZIP에 보관. 확인 표시는 사용자 수동 검수 기록이며 앱의 실전 인증이 아닙니다.',
    originals:entries.map(e=>({hash:e.hash,name:e.name,bytes:e.bytes,kind:e.kind,recordCount:e.count,
      importedAt:e.importedAt,userCheckedAt:e.userCheckedAt}))
  },null,2);
}
