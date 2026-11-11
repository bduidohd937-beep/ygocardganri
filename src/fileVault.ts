import { appendPreview, emptyFileCatalog, validateCatalog } from './fileCatalog';
import type { FileCatalog, PreviewAsset } from './fileCatalog';
const DATABASE='ygo_card_studio_file_vault';
const DATA='catalog';const BLOBS='originals';

function openVault():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB 미지원: 파일 원본을 영구 보관할 수 없습니다.'));
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(DATA))req.result.createObjectStore(DATA);
      if(!req.result.objectStoreNames.contains(BLOBS))req.result.createObjectStore(BLOBS);
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('저장소가 다른 탭에서 잠겨 있습니다.'));
  });
}
export async function loadCatalog():Promise<FileCatalog>{
  const db=await openVault();
  try {
    const raw=await new Promise<unknown>((resolve,reject)=>{
      const tx=db.transaction(DATA,'readonly');const request=tx.objectStore(DATA).get('v1');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    if(raw===undefined)return emptyFileCatalog();
    if(!validateCatalog(raw))throw new Error('저장된 파일 목록의 형식이 올바르지 않습니다. 원본을 보존하고 가져오기를 중단합니다.');
    return raw;
  }finally{db.close();}
}
export async function saveCatalog(catalog:FileCatalog):Promise<void>{
  if(!validateCatalog(catalog))throw new Error('파일 목록 데이터 형식이 유효하지 않습니다.');
  const db=await openVault();
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(DATA,'readwrite');tx.objectStore(DATA).put(catalog,'v1');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function commitImport(catalog:FileCatalog,themeId:string,previews:PreviewAsset[]):Promise<{catalog:FileCatalog; count:number}> {
  const next=appendPreview(catalog,themeId,previews);
  if(!validateCatalog(next))throw new Error('저장 전 파일 목록 검증에 실패했습니다.');
  const existing=new Set(catalog.assets.map(x=>x.id));
  const inserted=next.assets.filter(x=>!existing.has(x.id));
  const db=await openVault();
  try {
    await new Promise<void>((resolve,reject)=>{
      // One transaction: metadata cannot claim an original that failed to save.
      const tx=db.transaction([DATA,BLOBS],'readwrite');const store=tx.objectStore(BLOBS);
      for(const item of inserted){
        const source=previews.find(p=>p.sha256===item.sha256&&p.filename===item.filename&&p.path===item.archivePath);
        if(!source)throw new Error('원본 파일 내용을 찾지 못했습니다.');
        store.put(new Blob([source.bytes]),item.id);
      }
      tx.objectStore(DATA).put(next,'v1');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    return {catalog:next,count:inserted.length};
  }finally{db.close();}
}
export async function getOriginal(assetId:string):Promise<Blob>{
  const db=await openVault();
  try{return await new Promise<Blob>((resolve,reject)=>{
    const request=db.transaction(BLOBS,'readonly').objectStore(BLOBS).get(assetId);
    request.onsuccess=()=>request.result instanceof Blob?resolve(request.result):reject(new Error('로컬 원본 파일이 존재하지 않습니다.'));
    request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}