/** Dedicated browser-local P6 store; does not touch YDK, cards, Lua or P5 studies. */
import { validateDuelRecord } from './duelEvidence';
import type { DuelEvidenceRecord } from './duelEvidence';

const DATABASE='ygo_card_studio_engine_evidence';
const RECORDS='records', REPLAYS='replays';
function dbOpen():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다.'));
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(RECORDS))request.result.createObjectStore(RECORDS,{keyPath:'id'});
      if(!request.result.objectStoreNames.contains(REPLAYS))request.result.createObjectStore(REPLAYS);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('듀얼 증거 저장소를 열 수 없습니다.'));
    request.onblocked=()=>reject(new Error('다른 브라우저 탭이 저장소 변경을 막고 있습니다.'));
  });
}
export async function listDuelEvidence(studyId:string):Promise<DuelEvidenceRecord[]>{
  const db=await dbOpen();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction(RECORDS,'readonly').objectStore(RECORDS).getAll();
    request.onsuccess=()=>{
      const records:unknown=request.result;
      if(!Array.isArray(records)||records.length>3000||!records.every(validateDuelRecord)){
        reject(new Error('저장된 테스트 기록 일부가 손상됐습니다. 원본을 덮어쓰지 않았습니다.'));return;
      }
      resolve(records.filter(r=>r.studyId===studyId)
        .sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)));
    };
    request.onerror=()=>reject(request.error||new Error('테스트 기록을 읽지 못했습니다.'));
  });}finally{db.close();}
}
export async function storeDuelEvidence(record:DuelEvidenceRecord,replay:Blob|null):Promise<void>{
  if(!validateDuelRecord(record))throw new Error('테스트 기록 형식이 유효하지 않습니다.');
  if((record.replay===undefined)!==(replay===null))throw new Error('리플레이 증거 메타데이터와 파일이 일치하지 않습니다.');
  if(replay&&replay.size!==record.replay?.size)throw new Error('리플레이 파일 크기가 다릅니다.');
  const db=await dbOpen();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([RECORDS,REPLAYS],'readwrite');
    const store=tx.objectStore(RECORDS);
    const request=store.add(record);
    request.onerror=()=>{try{tx.abort();}catch{/* transactional abort already underway */}};
    if(replay)tx.objectStore(REPLAYS).add(replay,record.id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('듀얼 실험 기록 저장 실패'));
    tx.onabort=()=>reject(tx.error||new Error('중복 ID 또는 저장소 오류로 기록을 취소했습니다.'));
  });}finally{db.close();}
}
export async function getReplayEvidence(record:DuelEvidenceRecord):Promise<Blob>{
  if(!record.replay)throw new Error('연결된 리플레이가 없습니다.');
  const db=await dbOpen();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction(REPLAYS,'readonly').objectStore(REPLAYS).get(record.id);
    request.onsuccess=()=>{
      const blob:unknown=request.result;
      if(!(blob instanceof Blob)||blob.size!==record.replay?.size)
        return reject(new Error('브라우저에 저장된 리플레이 원본을 찾지 못했습니다.'));
      resolve(blob);
    };
    request.onerror=()=>reject(request.error||new Error('리플레이 원본 조회 실패'));
  });}finally{db.close();}
}
export async function removeDuelEvidence(id:string):Promise<void>{
  const db=await dbOpen();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([RECORDS,REPLAYS],'readwrite');
    tx.objectStore(RECORDS).delete(id);tx.objectStore(REPLAYS).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('기록 삭제 실패'));
    tx.onabort=()=>reject(tx.error||new Error('기록 삭제 취소'));
  });}finally{db.close();}
}
