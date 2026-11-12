/** Dedicated browser-local P6 store; does not touch YDK, cards, Lua or P5 studies. */
import { validateDuelRecord,validateEvidenceBackup } from './duelEvidence';
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


/**
 * P6.0.1: import metadata backups without overwriting existing records or replay blobs.
 * An imported replay descriptor never implies that its binary file was restored.
 */
export async function mergeDuelEvidenceBackup(payload:unknown):Promise<{added:number;unchanged:number}>{
  if(!validateEvidenceBackup(payload))throw new Error('EDOPro 테스트 기록 JSON 백업 형식이 유효하지 않습니다.');
  const db=await dbOpen();
  try{return await new Promise<{added:number;unchanged:number}>((resolve,reject)=>{
    const tx=db.transaction(RECORDS,'readwrite');
    const store=tx.objectStore(RECORDS);
    let added=0,unchanged=0,reason='EDOPro 테스트 기록 복원을 취소했습니다.';
    const request=store.getAll();
    request.onsuccess=()=>{
      const existing:unknown=request.result;
      if(!Array.isArray(existing)||existing.length>3000||!existing.every(validateDuelRecord)){
        reason='기존 테스트 기록에 오류가 있어 안전하게 복원을 중단했습니다.';tx.abort();return;
      }
      const byId=new Map(existing.map(r=>[r.id,r]));
      const incoming=payload.records.filter(r=>!byId.has(r.id));
      if(existing.length+incoming.length>3000){
        reason='테스트 기록 총 3000건 제한을 초과하여 복원을 중단했습니다.';tx.abort();return;
      }
      for(const record of payload.records){
        const old=byId.get(record.id);
        if(old){
          if(JSON.stringify(old)!==JSON.stringify(record)){
            reason='동일한 기록 ID에 서로 다른 데이터가 있습니다. 덮어쓰지 않았습니다.';tx.abort();return;
          }
          unchanged++;
        }else{
          store.add(record);added++;
        }
      }
    };
    tx.oncomplete=()=>resolve({added,unchanged});
    tx.onerror=()=>reject(tx.error||new Error(reason));
    tx.onabort=()=>reject(new Error(reason));
  });}finally{db.close();}
}
