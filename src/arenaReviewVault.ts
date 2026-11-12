/** P6.1 stage 2: review decisions are kept away from the imported original file vault. */
import type { ReviewCategory,ReviewMapping } from './arenaSessionReview';
import { REVIEW_CATEGORIES } from './arenaSessionReview';
export type StoredArenaReview={
  schemaVersion:1;sourceId:string;sourceSha256:string;studyId:string;studyRevision:number;
  deckFingerprint:string;revision:number;savedAt:string;mapping:ReviewMapping;
};
const DB='ygo_card_studio_arena_review',STORE='mappings';
const sha=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validStoredArenaReview(x:unknown):x is StoredArenaReview{
  if(!x||typeof x!=='object')return false;
  const v=x as Partial<StoredArenaReview>,m=v.mapping;
  return v.schemaVersion===1&&typeof v.sourceId==='string'&&v.sourceId.length>0&&v.sourceId.length<=350&&
    sha(v.sourceSha256)&&typeof v.studyId==='string'&&v.studyId.length>0&&v.studyId.length<=140&&
    typeof v.studyRevision==='number'&&Number.isSafeInteger(v.studyRevision)&&v.studyRevision>=1&&
    sha(v.deckFingerprint)&&typeof v.revision==='number'&&Number.isSafeInteger(v.revision)&&v.revision>=1&&
    typeof v.savedAt==='string'&&!Number.isNaN(Date.parse(v.savedAt))&&
    !!m&&typeof m.dataSet==='string'&&m.dataSet.length>0&&m.dataSet.length<=120&&
    typeof m.sessionField==='string'&&m.sessionField.length>0&&m.sessionField.length<=120&&
    typeof m.resultField==='string'&&m.resultField.length>0&&m.resultField.length<=120&&
    !!m.values&&typeof m.values==='object'&&!Array.isArray(m.values)&&
    Object.keys(m.values).length<=30&&
    Object.entries(m.values).every(([key,value])=>key.length>0&&key.length<=120&&
      REVIEW_CATEGORIES.includes(value as ReviewCategory));
}
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('분석 저장소를 열 수 없습니다.'));return;}
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'sourceId'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('결과 매핑 저장소 접근 실패'));
    req.onblocked=()=>reject(new Error('다른 탭에서 매핑 저장소를 사용 중입니다.'));
  });
}
export async function loadArenaReview(sourceId:string):Promise<StoredArenaReview|null>{
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get(sourceId);
    req.onsuccess=()=>{
      const value:unknown=req.result;
      if(value===undefined){resolve(null);return;}
      if(!validStoredArenaReview(value)){reject(new Error('매핑 기록이 손상되어 기존 기록을 변경하지 않았습니다.'));return;}
      resolve(value);
    };
    req.onerror=()=>reject(req.error||new Error('매핑 기록 읽기 실패'));
  });}finally{db.close();}
}
export async function saveArenaReview(
  draft:Omit<StoredArenaReview,'revision'|'savedAt'>,expectedRevision:number
):Promise<StoredArenaReview>{
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('매핑 버전이 올바르지 않습니다.');
  const candidate:StoredArenaReview={...draft,revision:expectedRevision+1,savedAt:new Date().toISOString()};
  if(!validStoredArenaReview(candidate))throw new Error('매핑 형식이 올바르지 않습니다.');
  const db=await openDb();
  let reason='다른 탭에서 매핑을 수정했거나 저장에 실패했습니다.';
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    const req=store.get(candidate.sourceId);
    req.onsuccess=()=>{
      const old:unknown=req.result;
      if(old!==undefined&&(!validStoredArenaReview(old)||(old as StoredArenaReview).revision!==expectedRevision)){
        tx.abort();return;
      }
      if(old===undefined&&expectedRevision!==0){tx.abort();return;}
      store.put(candidate);
    };
    req.onerror=()=>{reason='기존 매핑 조회에 실패했습니다.';tx.abort();};
    tx.oncomplete=()=>resolve(candidate);
    tx.onerror=()=>reject(tx.error||new Error(reason));
    tx.onabort=()=>reject(new Error(reason));
  });}finally{db.close();}
}
