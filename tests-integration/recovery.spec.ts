import {test,expect} from '@playwright/test';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H2cAAAAASUVORK5CYII=';
async function setup(page:import('@playwright/test').Page){
  await page.goto('/ygocardganri/');
  await page.evaluate(async(img)=>{
    localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
      schemaVersion:1,
      cards:[{id:'918760001',name:'기존 카드',theme:'RS',effect:'기존 원문',source:'기존'}],
      decks:[{name:'V2.9 검증 덱',main:['918760001','918760002','918760003','918760004'],
        extra:[],side:[],source:'검증 YDK'}]
    }));
    localStorage.setItem('ygo-art-lab-v1.1',JSON.stringify({cards:[
      {id:'918760003',name:'연구소의 다른 이름',theme:'RS',effect:'다른 효과'},
      {id:'918760004',name:'연구소 전용 신규',theme:'RS',effect:'연구소 효과'}
    ]}));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('duelmind-card-studio',3);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('projects'))req.result.createObjectStore('projects');};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({cards:[
        {id:918760001,name:'원본과 다른 이름',theme:'RS',effect:'다른 효과',artwork:img},
        {id:918760002,name:'신규 카드',theme:'RS',effect:'② 추가 효과',artwork:img},
        {id:918760003,name:'렌더러 이름',theme:'RS',effect:'렌더러 효과',artwork:img}
      ]},'current');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  },png);
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
}

test('V2.9: 신규 카드와 이미지를 개별 승인하고 YDK·원본 렌더러 자료를 보존',async({page})=>{
  page.on('dialog',d=>void d.accept());
  await setup(page);
  const panel=page.getByRole('region',{name:'누락 카드·일러스트 선택 복구'});
  await panel.getByRole('button',{name:'원본 자료실 복구 후보 검사'}).click();
  await expect(panel).toContainText('카드 충돌');
  await expect(panel).toContainText('원본 자료실 간 충돌');
  await expect(panel.getByRole('checkbox',{name:'918760001 카드 복구 선택'})).toBeDisabled();
  await expect(panel.getByRole('checkbox',{name:'918760003 카드 복구 선택'})).toBeDisabled();
  await panel.getByRole('checkbox',{name:'918760002 카드 복구 선택'}).check();
  await panel.getByRole('checkbox',{name:'918760002 이미지 복구 선택'}).check();
  await panel.getByRole('button',{name:/선택 복구 승인/}).click();
  await expect(panel.getByRole('status')).toContainText('카드 1종 · 이미지 1장');
  const result=await page.evaluate(async()=>{
    const saved=JSON.parse(localStorage.getItem('ygo-studio-shared-catalog-v1')!);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('ygo-studio-shared-media-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const ids=await new Promise<IDBValidKey[]>((resolve,reject)=>{
      const req=db.transaction('images','readonly').objectStore('images').getAllKeys();
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    db.close();
    const maker=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('duelmind-card-studio');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const cards=await new Promise<any[]>((resolve,reject)=>{
      const req=maker.transaction('projects','readonly').objectStore('projects').get('current');
      req.onsuccess=()=>resolve(req.result.cards);req.onerror=()=>reject(req.error);
    });maker.close();
    return {saved,ids:ids.map(String),makerName:cards[0].name};
  });
  expect(result.saved.cards).toHaveLength(2);
  expect(result.saved.cards[0].name).toBe('기존 카드');
  expect(result.saved.cards[0].effect).toBe('기존 원문');
  expect(result.saved.cards[1].id).toBe('918760002');
  expect(result.saved.decks[0].main).toEqual(['918760001','918760002','918760003','918760004']);
  expect(result.ids).toEqual(['918760002']);
  expect(result.makerName).toBe('원본과 다른 이름');
  const link=page.getByRole('region',{name:'덱 카드·일러스트 연결 진단'});
  await expect(link).toContainText('카드명 연결');
  await expect(link).toContainText('2/4장');
  await expect(link).toContainText('1/4장');
});

test('V2.9: 승인 전·취소 후 원장과 이미지 보관함은 변하지 않는다',async({page})=>{
  await setup(page);
  const panel=page.getByRole('region',{name:'누락 카드·일러스트 선택 복구'});
  const before=await page.evaluate(()=>localStorage.getItem('ygo-studio-shared-catalog-v1'));
  await panel.getByRole('button',{name:'원본 자료실 복구 후보 검사'}).click();
  await panel.getByRole('checkbox',{name:'918760002 카드 복구 선택'}).check();
  await panel.getByRole('button',{name:'검토 취소'}).click();
  expect(await page.evaluate(()=>localStorage.getItem('ygo-studio-shared-catalog-v1'))).toBe(before);
  const count=await page.evaluate(async()=>{
    const r=indexedDB.open('ygo-studio-shared-media-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const v=await new Promise<number>((resolve,reject)=>{
      const q=db.transaction('images','readonly').objectStore('images').count();
      q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });db.close();return v;
  });
  expect(count).toBe(0);
});
