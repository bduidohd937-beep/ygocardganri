import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const artwork='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H2cAAAAASUVORK5CYII=';

test('V2.8: YDK 존별 카드명·이미지 연결률과 누락 카드 ID를 읽기 전용으로 검토',async({page})=>{
  await page.goto('/ygocardganri/');
  const original=await page.evaluate(async(encoded)=>{
    const catalog={schemaVersion:1,
      cards:[
        {id:'918760001',name:'RS－오리온',theme:'RS',effect:'① 보관된 효과',source:'검증'},
        {id:'918760002',name:'RS－미리내',theme:'RS',effect:'② 보관된 효과',source:'검증'}
      ],
      decks:[{name:'연결 테스트',source:'테스트 YDK',main:['918760001','918760001','918760002','918760099'],
        extra:['918760101'],side:['918760002']}]};
    const saved=JSON.stringify(catalog);
    localStorage.setItem('ygo-studio-shared-catalog-v1',saved);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('ygo-studio-shared-media-v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('images',{keyPath:'id'});
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const blob=await(await fetch(encoded)).blob();
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('images','readwrite');
      tx.objectStore('images').add({id:'918760001',name:'RS－오리온',blob,mime:'image/png',
        sha256:'0'.repeat(64),source:'cardmaker',importedAt:'2026-11-12T00:00:00Z'});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();return saved;
  },artwork);
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
  const panel=page.getByRole('region',{name:'덱 카드·일러스트 연결 진단'});
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('카드명 연결');
  await expect(panel).toContainText('4/6장');
  await expect(panel).toContainText('2/6장');
  await expect(panel).toContainText('미등록 카드 ID');
  await expect(panel).toContainText('2종');
  await expect(panel.getByRole('img',{name:'RS－오리온 덱 연결 이미지'})).toBeVisible();
  await expect(panel.getByText('ID 918760001 · 2장', {exact:false})).toBeVisible();
  await expect(panel.getByText('공통 카드 원장에 없는 ID: 918760099, 918760101', {exact:false})).toBeVisible();
  await panel.getByRole('button',{name:/엑스트라/}).click();
  await expect(panel.getByText('ID 918760101', {exact:false})).toBeVisible();
  await panel.getByRole('button',{name:/사이드/}).click();
  await expect(panel.getByText('RS－미리내')).toBeVisible();
  const pending=page.waitForEvent('download');
  await panel.getByRole('button',{name:/미등록 카드 ID TXT 저장/}).click();
  const download=await pending;
  expect(download.suggestedFilename()).toBe('연결 테스트_누락카드ID.txt');
  expect((await readFile(await download.path()!)).toString()).toBe('918760099\n918760101\n');
  const after=await page.evaluate(()=>localStorage.getItem('ygo-studio-shared-catalog-v1'));
  expect(after).toBe(original);
});

test('V2.8: 일러스트 신규 연결 후 새로고침 없이 덱 이미지 연결률 갱신',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ygocardganri/');
  await page.evaluate(async(encoded)=>{
    localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
      schemaVersion:1,cards:[{id:'918760001',name:'RS－오리온',theme:'RS',effect:'효과',source:'검증'}],
      decks:[{name:'원핸드 테스트',main:['918760001'],extra:[],side:[],source:'검증'}]
    }));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const r=indexedDB.open('duelmind-card-studio',3);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('projects'))r.result.createObjectStore('projects');};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({name:'원본 프로젝트',cards:[
        {id:918760001,name:'RS－오리온',artwork:encoded}
      ]},'current');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  },artwork);
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
  const panel=page.getByRole('region',{name:'덱 카드·일러스트 연결 진단'});
  await expect(panel).toContainText('0/1장');
  await page.getByRole('region',{name:'카드 ID 연결 이미지 보관함'})
    .getByRole('button',{name:'렌더러 일러스트 신규 연결'}).click();
  await expect(panel).toContainText('이미지 연결');
  await expect(panel).toContainText('1/1장');
  await expect(panel.getByRole('img',{name:'RS－오리온 덱 연결 이미지'})).toBeVisible();
});
