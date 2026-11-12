import {validCardId,type SharedCard} from './sharedCatalog';

export const MEDIA_DATABASE='ygo-studio-shared-media-v1';
export type MediaItem={id:string;name:string;blob:Blob;mime:string;sha256:string;source:'cardmaker';importedAt:string};
export type MediaImportResult={added:number;duplicate:number;unmatched:number;invalid:number;total:number};

async function openMedia():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(MEDIA_DATABASE);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('images'))r.result.createObjectStore('images',{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||Error('공통 이미지 보관함을 열지 못했습니다.'));
  });
}
function readRequest<T>(r:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('이미지 읽기 실패'));});
}
export async function listMedia():Promise<MediaItem[]>{
  const db=await openMedia();
  try{
    const tx=db.transaction('images','readonly');
    const result=await readRequest(tx.objectStore('images').getAll() as IDBRequest<MediaItem[]>);
    return result.filter(x=>validCardId(x.id)!==null&&x.blob instanceof Blob);
  }finally{db.close();}
}
export async function readMakerCards():Promise<Array<{id:unknown;name:unknown;artwork:unknown;theme?:unknown;effect?:unknown}>>{
  if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(x=>x.name==='duelmind-card-studio'))return [];
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const r=indexedDB.open('duelmind-card-studio');
    r.onupgradeneeded=()=>r.transaction?.abort();
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('카드 렌더러 저장소 접근 실패'));
  });
  try{
    if(!db.objectStoreNames.contains('projects'))return [];
    const project=await readRequest(db.transaction('projects','readonly').objectStore('projects').get('current')) as {cards?:unknown}|undefined;
    if(!Array.isArray(project?.cards))return [];
    return project.cards.slice(0,2000);
  }finally{db.close();}
}
export async function syncMakerImages(cards:SharedCard[]):Promise<MediaImportResult>{
  const allowed=new Set(cards.map(c=>c.id)),source=await readMakerCards();
  const report:MediaImportResult={added:0,duplicate:0,unmatched:0,invalid:0,total:source.length};
  if(!source.length)return report;
  const db=await openMedia();
  try{
    const existing=new Set((await readRequest(db.transaction('images','readonly').objectStore('images').getAllKeys())).map(String));
    const proposed:MediaItem[]=[];
    let bytes=0;
    for(const card of source){
      const id=validCardId(card.id);
      if(!id){report.invalid++;continue;}
      if(!allowed.has(id)){report.unmatched++;continue;}
      if(existing.has(id)){report.duplicate++;continue;}
      if(typeof card.artwork!=='string'||!/^data:image\/(png|jpeg|webp);base64,/i.test(card.artwork)){report.invalid++;continue;}
      try{
        const res=await fetch(card.artwork);
        const blob=await res.blob();
        if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size===0||blob.size>7*1024*1024)
          throw Error('이미지 형식 또는 크기 제한 초과');
        bytes+=blob.size;
        if(bytes>96*1024*1024)throw Error('공통 이미지 보관함 96MiB 제한 초과');
        const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
        const sha256=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
        proposed.push({id,name:typeof card.name==='string'?card.name.slice(0,120):id,
          blob,mime:blob.type,sha256,source:'cardmaker',importedAt:new Date().toISOString()});
        existing.add(id);
      }catch{report.invalid++;}
    }
    if(!proposed.length)return report;
    const tx=db.transaction('images','readwrite');
    const completed=new Promise<void>((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('이미지 저장 중단'));
      tx.onerror=()=>reject(tx.error||Error('이미지 저장 실패'));
    });
    proposed.forEach(item=>tx.objectStore('images').add(item));
    await completed;
    report.added=proposed.length;
  }finally{db.close();}
  return report;
}
