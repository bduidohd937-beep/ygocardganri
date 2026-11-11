import { createInitialData } from './data';
import type { StudioData } from './data';
import { loadOrSeed, validateBackup } from './logic';

const DB_NAME = 'ygo_card_studio';
const STORE = 'workspace';
const KEY = 'project_v1';
const FALLBACK_KEY = 'ygo_card_studio_local_v1';
export type StorageMode = 'IndexedDB'|'localStorage';

function openDatabase():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

export async function loadWorkspace():Promise<{data:StudioData;mode:StorageMode}> {
  try{
    const db=await openDatabase();
    const raw=await new Promise<unknown>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).get(KEY);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    }); db.close();
    if(raw === undefined || raw === null)return {data:createInitialData(),mode:'IndexedDB'};
    if(validateBackup(raw))return {data:raw,mode:'IndexedDB'};
    throw new Error('저장 데이터 구조가 유효하지 않습니다.');
  }catch{
    let backup:string|null=null;
    try{backup=localStorage.getItem(FALLBACK_KEY);}catch{/* 스토리지가 막혀도 화면은 표시 */}
    return {data:loadOrSeed(backup),mode:'localStorage'};
  }
}

export async function saveWorkspace(data:StudioData,mode:StorageMode):Promise<void> {
  if(mode==='localStorage'){localStorage.setItem(FALLBACK_KEY,JSON.stringify(data));return;}
  const db=await openDatabase();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,KEY);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close();}
}