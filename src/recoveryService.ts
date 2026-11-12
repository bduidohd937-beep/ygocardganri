import {parseCards,validCardId,type SharedCatalog,type SharedDeck,type SharedCard} from './sharedCatalog';
import {listMedia,readMakerCards,type MediaItem} from './sharedMedia';
import {assessRecovery,deckRecoveryIds,type RecoveryRow} from './recoveryModel';

const IMAGE_LIMIT=7*1024*1024;
const BATCH_LIMIT=96*1024*1024;
const DB='ygo-studio-shared-media-v1';
const MIME=new Set(['image/png','image/jpeg','image/webp']);
const digest=async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))]
  .map(v=>v.toString(16).padStart(2,'0')).join('');

export async function scanDeckRecovery(deck:SharedDeck,catalog:SharedCatalog):Promise<{rows:RecoveryRow[];warnings:string[]}>{
  const ids=new Set(deckRecoveryIds(deck));
  const warnings:string[]=[];
  const candidateCards:SharedCard[]=[];
  let maker:Awaited<ReturnType<typeof readMakerCards>>=[];
  try{
    maker=await readMakerCards();
    candidateCards.push(...parseCards(maker,'통합 카드 렌더러').cards.filter(c=>ids.has(c.id)));
  }catch(e){warnings.push('카드 렌더러 자료 조회 실패: '+String(e));}
  try{
    const raw=localStorage.getItem('ygo-art-lab-v1.1');
    if(raw){
      const parsed:unknown=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&!('demo' in parsed&&parsed.demo)){
        const rows=(parsed as {cards?:unknown}).cards;
        if(Array.isArray(rows))candidateCards.push(...parseCards(rows,'통합 이미지 연구소').cards.filter(c=>ids.has(c.id)));
      }
    }
  }catch(e){warnings.push('이미지 연구소 자료 조회 실패: '+String(e));}
  const media=await listMedia();
  const existing=new Map(media.map(m=>[m.id,m]));
  const images=new Map<string,MediaItem>();
  const currentHashes=new Map<string,string>();
  const blockedIds=new Set<string>();
  let imageBytes=0,skipped=0;
  for(const raw of maker){
    const id=validCardId(raw.id);
    if(!id||!ids.has(id)||typeof raw.artwork!=='string'||!/^data:image\/(png|jpeg|webp);base64,/i.test(raw.artwork))continue;
    if(raw.artwork.length>10*1024*1024){skipped++;continue;}
    try{
      const blob=await(await fetch(raw.artwork)).blob();
      if(!MIME.has(blob.type)||blob.size===0||blob.size>IMAGE_LIMIT){skipped++;continue;}
      imageBytes+=blob.size;
      if(imageBytes>BATCH_LIMIT){skipped++;continue;}
      const sha256=await digest(blob);
      if(images.has(id)){
        if(images.get(id)?.sha256!==sha256)blockedIds.add(id);
        continue;
      }
      images.set(id,{id,name:typeof raw.name==='string'?raw.name.slice(0,120):id,
        blob,mime:blob.type,sha256,source:'cardmaker',importedAt:new Date().toISOString()});
    }catch{skipped++;}
  }
  if(skipped)warnings.push('유효하지 않거나 크기 제한을 초과한 이미지 '+skipped+'장 제외');
  for(const [id,old] of existing){
    if(images.has(id)&&!blockedIds.has(id)){
      try{
        if(old.blob.size<=IMAGE_LIMIT)currentHashes.set(id,await digest(old.blob));
      }catch{/* Existing data is preserved even when its hash cannot be read. */}
    }
  }
  return {rows:assessRecovery(deck,catalog,media,candidateCards,images,currentHashes,blockedIds),warnings};
}

/** A single IndexedDB add-only transaction; duplicates abort rather than overwrite. */
export async function addRecoveryImages(images:MediaItem[]):Promise<number>{
  if(!images.length)return 0;
  const unique=new Set<string>();let bytes=0;
  for(const item of images){
    if(!validCardId(item.id)||unique.has(item.id)||!MIME.has(item.mime)||!(item.blob instanceof Blob)||
      item.blob.type!==item.mime||item.blob.size<1||item.blob.size>IMAGE_LIMIT)
      throw Error('복구 이미지 ID·형식·크기가 올바르지 않습니다.');
    if(await digest(item.blob)!==item.sha256)throw Error('이미지 검사 이후 내용이 변경되었습니다.');
    unique.add(item.id);bytes+=item.blob.size;
    if(bytes>BATCH_LIMIT)throw Error('한 번에 최대 96MiB까지만 복구할 수 있습니다.');
  }
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open(DB);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('images'))req.result.createObjectStore('images',{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('이미지 보관함 열기 실패'));
  });
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('images','readwrite');
      const store=tx.objectStore('images');
      for(const item of images)store.add(item);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||Error('이미지 복구 실패'));
      tx.onabort=()=>reject(new Error('동일 ID 이미지가 먼저 등록되었거나 저장이 중단되었습니다. 기존 이미지는 보존했습니다.'));
    });
  }finally{db.close();}
  return images.length;
}
