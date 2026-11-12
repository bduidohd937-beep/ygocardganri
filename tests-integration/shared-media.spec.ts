import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
const testPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H2cAAAAASUVORK5CYII=';

test('V2.7: 카드 렌더러 일러스트를 공통 ID로만 연결하고 원본 유지·ZIP 보관',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ygocardganri/');
  await page.evaluate(async(artwork)=>{
    localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
      schemaVersion:1,cards:[{id:'918760001',name:'공유 RS 카드',theme:'아칠리쉬',effect:'효과',source:'검증'}],
      decks:[]
    }));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const r=indexedDB.open('duelmind-card-studio',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('projects');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put({version:1,name:'원본 카드',cards:[
        {id:918760001,name:'공유 RS 카드',theme:'아칠리쉬',frame:'effect',artwork},
        {id:918760002,name:'미등록 ID',frame:'effect',artwork}
      ]},'current');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  },testPng);
  await page.locator('.sidebar .nav-link').filter({hasText:'공통 카드·덱 보관함'}).click();
  const gallery=page.getByRole('region',{name:'카드 ID 연결 이미지 보관함'});
  await expect(gallery).toBeVisible();
  await gallery.getByRole('button',{name:'렌더러 일러스트 신규 연결'}).click();
  await expect(gallery.getByRole('status')).toContainText('신규 1장 연결');
  await expect(gallery.getByText('공유 RS 카드')).toBeVisible();
  await expect(gallery.getByRole('img',{name:'공유 RS 카드 일러스트'})).toBeVisible();
  const records=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const r=indexedDB.open('ygo-studio-shared-media-v1');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    const req=db.transaction('images').objectStore('images').getAll();
    const v=await new Promise<Array<{id:string;blob:Blob;sha256:string}>>((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    db.close();
    return v.map(x=>({id:x.id,size:x.blob.size,sha256:x.sha256}));
  });
  expect(records).toHaveLength(1);
  expect(records[0].id).toBe('918760001');
  expect(records[0].size).toBeGreaterThan(0);

  await gallery.getByRole('button',{name:'렌더러 일러스트 신규 연결'}).click();
  await expect(gallery.getByRole('status')).toContainText('이미 등록됨 1장 보존');

  await page.locator('.sidebar .nav-link').filter({hasText:'기존 사이트 데이터 이전'}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'현재 통합 자료 ZIP 다운로드'}).click();
  const download=await downloadPromise;
  const zip=await JSZip.loadAsync(await readFile(await download.path()!));
  const manifest=JSON.parse(await zip.file('백업목록.json')!.async('string')) as {
    records:Array<{dataset:string}>,blobs:Array<{path:string}>
  };
  expect(manifest.records.map(x=>x.dataset)).toContain('shared-media');
  expect(manifest.blobs.length).toBeGreaterThanOrEqual(1);
});
