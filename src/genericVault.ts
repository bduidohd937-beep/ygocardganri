/** 범용 카드 전용 이미지·Lua 원문. 파일센터, 렌더러 저장소를 수정하지 않는다. */
import type {GenericSlot} from './genericCatalog';
export type GenericAsset={id:string;key:string;slot:GenericSlot;blob:Blob;filename:string;updatedAt:string};
const DB='ygo_studio_generic_card_assets_v1',STORE='assets';
const slots:readonly GenericSlot[]=['original','overframe','final','lua'];
function keyFor(key:string,slot:GenericSlot){return key+'::'+slot;}
function openDB():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(Error('IndexedDB가 없어 첨부 파일을 저장할 수 없습니다.'));
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('도감 저장소 연결 실패'));
    req.onblocked=()=>reject(Error('다른 탭에서 도감 저장소가 잠겨 있습니다.'));
  });
}
function checkAsset(asset:GenericAsset){
  if(!asset||!asset.key||!slots.includes(asset.slot)||asset.id!==keyFor(asset.key,asset.slot)||
    !(asset.blob instanceof Blob)||asset.blob.size===0||
    asset.blob.size>(asset.slot==='lua'?1:10)*1024*1024||
    typeof asset.filename!=='string'||asset.filename.length>160)throw Error('도감 첨부파일 형식/크기가 올바르지 않습니다.');
  if(asset.slot==='lua'){
    if(!/\.lua$/i.test(asset.filename))throw Error('Lua 첨부는 .lua 파일만 가능합니다.');
  }else if(!['image/png','image/jpeg','image/webp'].includes(asset.blob.type)){
    throw Error('이미지는 PNG/JPG/WebP만 허용됩니다.');
  }
}
export async function loadGenericAssets():Promise<GenericAsset[]>{
  const db=await openDB();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    req.onsuccess=()=>{
      const records=req.result as GenericAsset[];
      if(records.some(a=>{try{checkAsset(a);return false;}catch{return true;}})){reject(Error('도감 첨부 파일이 손상되었습니다. 기존 자료를 변경하지 않았습니다.'));return;}
      resolve(records);
    };
    req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
export async function saveGenericAsset(key:string,slot:GenericSlot,file:File):Promise<void>{
  const blob=new Blob([await file.arrayBuffer()],{type:slot==='lua'?'text/plain':file.type});
  const asset:GenericAsset={id:keyFor(key,slot),key,slot,blob,filename:file.name,updatedAt:new Date().toISOString()};
  checkAsset(asset);
  const db=await openDB();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(asset);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function restoreGenericAssets(assets:GenericAsset[]):Promise<void>{
  if(assets.length>8000||assets.some(a=>{try{checkAsset(a);return false;}catch{return true;}}))throw Error('도감 파일 일괄 복원 검증 실패');
  const db=await openDB();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    for(const asset of assets)tx.objectStore(STORE).put(asset);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export function makeGenericAsset(key:string,slot:GenericSlot,blob:Blob,filename:string):GenericAsset{
  const asset={id:keyFor(key,slot),key,slot,blob,filename,updatedAt:new Date().toISOString()};
  checkAsset(asset);
  return asset;
}
