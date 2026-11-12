/** Separate P6.1 quarantine: never writes to P5, P6 or uploaded source vaults. */
import { validateArenaIntakeRecord } from './arenaIntake';
import type { ArenaIntakeRecord } from './arenaIntake';

const DB='ygo_card_studio_arena_intake',ITEMS='items',BLOBS='blobs';
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB를 사용할 수 없습니다.'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(ITEMS))req.result.createObjectStore(ITEMS,{keyPath:'id'});
      if(!req.result.objectStoreNames.contains(BLOBS))req.result.createObjectStore(BLOBS);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('수집함을 열 수 없습니다.'));
    req.onblocked=()=>reject(new Error('다른 브라우저 탭이 수집함을 사용 중입니다.'));
  });
}
export async function listArenaIntake(studyId:string):Promise<ArenaIntakeRecord[]>{
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction(ITEMS,'readonly').objectStore(ITEMS).getAll();
    request.onsuccess=()=>{
      const rows:unknown=request.result;
      if(!Array.isArray(rows)||rows.length>200||!rows.every(validateArenaIntakeRecord)){
        reject(new Error('수집 기록이 손상됐습니다. 원본을 덮어쓰지 않았습니다.'));return;
      }
      resolve(rows.filter(r=>r.studyId===studyId).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)));
    };
    request.onerror=()=>reject(request.error||new Error('수집 기록을 읽을 수 없습니다.'));
  });}finally{db.close();}
}
/** Deterministic SHA-256 identity avoids duplicate imports after a reload. */
export function arenaIntakeId(studyId:string,revision:number,fingerprint:string,hash:string):string{
  return studyId+':'+revision+':'+fingerprint+':'+hash;
}
export async function addArenaIntake(record:ArenaIntakeRecord,file:Blob):Promise<boolean>{
  if(!validateArenaIntakeRecord(record)||record.size!==file.size||
    record.id!==arenaIntakeId(record.studyId,record.studyRevision,record.deckFingerprint,record.sha256))
    throw new Error('수집 기록 메타데이터 또는 파일 크기가 올바르지 않습니다.');
  const db=await openDb();
  try{return await new Promise<boolean>((resolve,reject)=>{
    const tx=db.transaction([ITEMS,BLOBS],'readwrite');
    const meta=tx.objectStore(ITEMS);
    let added=false;
    let reason='수집 기록 저장을 중단했습니다.';
    const all=meta.getAll();
    all.onsuccess=()=>{
      const rows:unknown=all.result;
      if(!Array.isArray(rows)||rows.length>200||!rows.every(validateArenaIntakeRecord)){
        reason='수집함 기록에 오류가 있어 원본을 유지하고 중단합니다.';tx.abort();return;
      }
      if(rows.some(r=>r.id===record.id))return;
      if(rows.length>=200){reason='수집함 최대 200개를 초과합니다.';tx.abort();return;}
      meta.add(record);tx.objectStore(BLOBS).add(file,record.id);added=true;
    };
    tx.oncomplete=()=>resolve(added);
    tx.onerror=()=>reject(tx.error||new Error(reason));
    tx.onabort=()=>reject(new Error(reason));
  });}finally{db.close();}
}
export async function getArenaIntakeFile(id:string):Promise<Blob>{
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(BLOBS,'readonly').objectStore(BLOBS).get(id);
    req.onsuccess=()=>{
      const value:unknown=req.result;
      if(!(value instanceof Blob))reject(new Error('수집 원본 파일을 찾을 수 없습니다.'));
      else resolve(value);
    };
    req.onerror=()=>reject(req.error||new Error('수집 원본을 읽지 못했습니다.'));
  });}finally{db.close();}
}
export async function removeArenaIntake(id:string):Promise<void>{
  const db=await openDb();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([ITEMS,BLOBS],'readwrite');
    tx.objectStore(ITEMS).delete(id);tx.objectStore(BLOBS).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('수집 기록 삭제 실패'));
    tx.onabort=()=>reject(tx.error||new Error('수집 기록 삭제 취소'));
  });}finally{db.close();}
}
