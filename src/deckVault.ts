/** Deck research scenarios are independent from imported YDK source, CDB, Lua, and approved card texts. */
import { validateDeckBackup, validateDeckStudy } from './deckMath';
import type { DeckStudy, DeckStudyBackup } from './deckMath';
const DATABASE='ygo_card_studio_deck_lab';
const STORE='studies';
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB가 지원되지 않습니다. 덱 분석안을 로컬에 저장할 수 없습니다.'));
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('덱 저장소 접근 실패'));
    req.onblocked=()=>reject(new Error('다른 탭에서 덱 저장소의 버전 변경을 차단 중입니다.'));
  });
}
export async function getDeckStudies():Promise<DeckStudy[]>{
  const db=await openDb();
  try{
    return await new Promise<DeckStudy[]>((resolve,reject)=>{
      const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess=()=>{
        const value:unknown=req.result;
        if(!Array.isArray(value)||value.length>2000||!value.every(validateDeckStudy))
          return reject(new Error('저장된 덱 연구안 형식이 유효하지 않습니다. 기존 데이터를 덮어쓰지 않았습니다.'));
        resolve(value.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
      };
      req.onerror=()=>reject(req.error||new Error('덱 연구안 조회 실패'));
    });
  }finally{db.close();}
}
/** Atomic optimistic revision check. Prevents accidental overwrite by two tabs. */
export async function saveDeckStudy(study:DeckStudy):Promise<DeckStudy>{
  if(!validateDeckStudy(study))throw new Error('덱 연구안 형식이 유효하지 않습니다.');
  const db=await openDb();
  let next:DeckStudy|null=null;
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      const check=store.get(study.id);
      check.onsuccess=()=>{
        const old:unknown=check.result;
        if(old!==undefined&&(!validateDeckStudy(old)||old.revision!==study.revision)){
          tx.abort();return;
        }
        if(old===undefined&&study.revision!==0){tx.abort();return;}
        next={...study,revision:study.revision+1,updatedAt:new Date().toISOString()};
        store.put(next);
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('저장 실패'));
      tx.onabort=()=>reject(new Error('다른 탭에서 분석안이 변경되었거나 저장이 중단됐습니다. 새로 불러온 뒤 비교하세요.'));
    });
    if(!next)throw new Error('덱 분석안 저장에 실패했습니다.');
    return next;
  }finally{db.close();}
}
export async function deleteDeckStudy(id:string,revision:number):Promise<void>{
  if(!id||!Number.isSafeInteger(revision))throw new Error('삭제 요청이 유효하지 않습니다.');
  const db=await openDb();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    const request=store.get(id);
    request.onsuccess=()=>{
      if(!validateDeckStudy(request.result)||request.result.revision!==revision){tx.abort();return;}
      store.delete(id);
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('삭제 실패'));
    tx.onabort=()=>reject(new Error('삭제 전 다른 탭에서 분석안이 변경되었거나 분석안이 없습니다.'));
  });}finally{db.close();}
}
export async function restoreDeckStudies(payload:unknown):Promise<number>{
  if(!validateDeckBackup(payload))throw new Error('P5 덱 연구안 백업 형식이 올바르지 않습니다.');
  const db=await openDb();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);
    store.clear();
    for(const study of payload.studies)store.put(study);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('덱 연구안 복원 실패'));
    tx.onabort=()=>reject(tx.error||new Error('덱 연구안 복원 중 중단됨'));
  });return payload.studies.length;}finally{db.close();}
}
export function makeDeckBackup(studies:DeckStudy[]):DeckStudyBackup{
  if(studies.length>2000||!studies.every(validateDeckStudy))throw new Error('유효한 연구안만 백업할 수 있습니다.');
  return {kind:'ygo_card_studio_deck_lab',schemaVersion:1,exportedAt:new Date().toISOString(),studies};
}
