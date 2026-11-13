import {test,expect} from '@playwright/test';
const tinyPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H2cAAAAASUVORK5CYII=';
test('V3.0: 공통 카드, 이미지, CDB 원문, Lua, YDK를 ID로 결합하되 원본을 수정하지 않는다',async({page})=>{
 await page.goto('/ygocardganri/');
 const originals=await page.evaluate(async(encoded)=>{
   const id='918760001';
   const card={id,name:'RS－오리온',theme:'RS',effect:'① 공통 효과',source:'사용자 입력'};
   const common={schemaVersion:1,cards:[card],decks:[{name:'전개 덱',source:'검증',main:[id,id],extra:[id],side:[]}]};
   const saved=JSON.stringify(common);
   localStorage.setItem('ygo-studio-shared-catalog-v1',saved);
   const open=async(name:string,version=1,storeNames:string[]=[])=>new Promise<IDBDatabase>((resolve,reject)=>{
     const req=indexedDB.open(name,version);
     req.onupgradeneeded=()=>{for(const store of storeNames)if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store);};
     req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   const media=await open('ygo-studio-shared-media-v1',1,['images']);
   const blob=await(await fetch(encoded)).blob();
   await new Promise<void>((resolve,reject)=>{
     const tx=media.transaction('images','readwrite');tx.objectStore('images').put({
       id,name:'RS－오리온',blob,mime:'image/png',sha256:'a'.repeat(64),source:'cardmaker',importedAt:'2026-11-13'
     },id);
     tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
   });media.close();
   const fileDb=await open('ygo_card_studio_file_vault',1,['catalog','originals']);
   const assets=[
     {id:'cdb1',themeId:'nocturna',kind:'CDB',filename:'아칠리쉬.cdb',archivePath:'아칠리쉬.cdb',cardId:null,sha256:'b'.repeat(64),
      size:100,importedAt:'2026-11-13',source:'직접',notes:[],cardCount:1},
     {id:'lua1',themeId:'nocturna',kind:'Lua',filename:'c918760001.lua',archivePath:'c918760001.lua',cardId:id,sha256:'c'.repeat(64),
      size:32,importedAt:'2026-11-13',source:'직접',notes:[],cardCount:0}
   ];
   const source={schemaVersion:1,themes:[{id:'nocturna',name:'아칠리쉬',description:'',createdAt:'2026-11-13',seed:false}],
     assets,cards:[{themeId:'nocturna',passcode:id,name:'RS－오리온',effectText:'① 공통 효과',sourceId:'cdb1',importedAt:'2026-11-13',confirmed:false}],
     decks:[{id:'extraDeck',themeId:'nocturna',sourceId:'cdb1',name:'다른 덱.ydk',main:[id],extra:[],side:[]}]};
   await new Promise<void>((resolve,reject)=>{
     const tx=fileDb.transaction(['catalog','originals'],'readwrite');tx.objectStore('catalog').put(source,'v1');
     tx.objectStore('originals').put(new Blob(['function s.initial_effect(c) end']),'lua1');
     tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
   });fileDb.close();return {saved,source};
 },tinyPng);
 await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
 const panel=page.getByRole('region',{name:'V3.0 카드 ID 통합 관리'});
 await expect(panel).toBeVisible();
 await expect(panel.getByText('전체 ID')).toBeVisible();
 await expect(panel.getByText('4/4', {exact:false}).first()).toBeVisible();
 await expect(panel.getByRole('button',{name:'918760001 통합 상세 보기'})).toBeVisible();
 const detail=panel.getByRole('region',{name:'선택 카드 통합 상세'});
 await expect(detail).toContainText('CDB 1건 · Lua 1개');
 await expect(detail).toContainText('메인 2 / 엑스트라 1 / 사이드 0');
 await expect(detail).toContainText('다른 덱.ydk');
 await expect(detail.getByRole('img',{name:'RS－오리온 통합 이미지'})).toBeVisible();
 const download=page.waitForEvent('download');
 await panel.getByRole('button',{name:'현재 검색 결과 CSV 내보내기'}).click();
 expect((await download).suggestedFilename()).toBe('통합카드_ID별_연결진단_V3.0.csv');
 const actual=await page.evaluate(async()=>{
   const saved=localStorage.getItem('ygo-studio-shared-catalog-v1');
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{
     const r=indexedDB.open('ygo_card_studio_file_vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
   });
   const file=await new Promise<unknown>((resolve,reject)=>{
     const q=db.transaction('catalog','readonly').objectStore('catalog').get('v1');
     q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
   });db.close();return {saved,file};
 });
 expect(actual.saved).toEqual(originals.saved);
 expect(actual.file).toEqual(originals.source);
});
test('V3.0: 누락 필터, 상세 패널과 파일 센터 이동',async({page})=>{
 await page.goto('/ygocardganri/');
 await page.evaluate(()=>localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
   schemaVersion:1,cards:[{id:'918760001',name:'단독 카드',theme:'RS',effect:'',source:'수동'}],decks:[]
 })));
 await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
 const panel=page.getByRole('region',{name:'V3.0 카드 ID 통합 관리'});
 await expect(panel.getByRole('button',{name:'918760001 통합 상세 보기'})).toBeVisible();
 await panel.getByRole('button',{name:'누락',exact:true}).click();
 await expect(panel).toContainText('누락 3종');
 await panel.getByRole('button',{name:'파일 센터에서 CDB · Lua · 이미지 등록'}).click();
 await expect(page.getByText('파일 센터', {exact:true}).first()).toBeVisible();
});
