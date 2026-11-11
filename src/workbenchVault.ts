/** Separate IndexedDB namespace preserves the P1/P2 stores without migration. */
import { cardRecordKey, emptyImportedRecord, validateImportedRecord } from './importedWorkbench';
import type { ImportedRecord } from './importedWorkbench';
const DATABASE='ygo_card_studio_imported_workbench';
const STORE='records';
function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB가 제공되지 않습니다.'));
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('다른 탭의 저장소가 잠겨 있습니다.'));
  });
}
export async function loadImportedRecord(themeId:string,passcode:string):Promise<ImportedRecord>{
  const db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get(cardRecordKey(themeId,passcode));
    req.onsuccess=()=>{
      const value:unknown=req.result;
      if(value===undefined){resolve(emptyImportedRecord(themeId,passcode));return;}
      if(!validateImportedRecord(value)||value.themeId!==themeId||value.passcode!==passcode){reject(new Error('저장된 카드 작업 문서가 유효하지 않습니다. 데이터를 덮어쓰지 않습니다.'));return;}
      resolve(value);
    };
    req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
/** Compare-and-swap inside the same transaction prevents silent multi-tab overwrites. */
export async function saveImportedRecord(value:ImportedRecord,expectedRevision:number):Promise<void>{
  if(!validateImportedRecord(value)||value.revision<=expectedRevision)throw new Error('저장할 변경 이력이 유효하지 않습니다.');
  const db=await openDatabase();
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    const req=store.get(cardRecordKey(value.themeId,value.passcode));
    req.onsuccess=()=>{
      const previous:unknown=req.result;
      if(previous!==undefined&&!validateImportedRecord(previous)) {tx.abort();return;}
      const revision=previous===undefined?0:(previous as ImportedRecord).revision;
      if(revision!==expectedRevision){tx.abort();return;}
      store.put(value,cardRecordKey(value.themeId,value.passcode));
    };
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(new Error('다른 탭에서 문서를 수정했거나 저장소 오류가 발생했습니다. 새로고침 후 확인하세요.'));
  });}finally{db.close();}
}

export type ImportedWorkbenchBackup={
  kind:'ygo_card_studio_imported_workbench';schemaVersion:1;exportedAt:string;
  records:ImportedRecord[];
};
export async function loadAllImportedRecords():Promise<ImportedRecord[]>{
  const db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    req.onsuccess=()=>{
      const all:unknown=req.result;
      if(!Array.isArray(all)||all.some(v=>!validateImportedRecord(v))){reject(new Error('저장된 문서 중 유효하지 않은 항목이 있습니다. 내보내기를 중단합니다.'));return;}
      resolve(all as ImportedRecord[]);
    };
    req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
export function validateWorkbenchBackup(value:unknown):value is ImportedWorkbenchBackup {
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<ImportedWorkbenchBackup>;
  if(v.kind!=='ygo_card_studio_imported_workbench'||v.schemaVersion!==1||typeof v.exportedAt!=='string'||!Array.isArray(v.records)||v.records.length>50000)return false;
  if(v.records.some(r=>!validateImportedRecord(r)))return false;
  const keys=new Set(v.records.map(r=>cardRecordKey(r.themeId,r.passcode)));
  return keys.size===v.records.length;
}
/** Import merges by theme/card ID; conflicting records overwrite only after explicit UI confirmation. */
export async function restoreWorkbenchBackup(backup:ImportedWorkbenchBackup):Promise<number>{
  if(!validateWorkbenchBackup(backup))throw new Error('가져올 문서 백업 형식이 잘못되었습니다.');
  const db=await openDatabase();
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    for(const r of backup.records)store.put(r,cardRecordKey(r.themeId,r.passcode));
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });return backup.records.length;}finally{db.close();}
}