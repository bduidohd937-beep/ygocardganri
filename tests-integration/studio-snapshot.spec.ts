import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

async function openBackup(page:import('@playwright/test').Page){
  await page.goto('/ygocardganri/');
  await page.locator('.sidebar .nav-link').filter({hasText:'기존 사이트 데이터 이전'}).click();
  await expect(page.getByRole('heading',{name:'통합 작업실 백업·복원'})).toBeVisible();
}
async function setup(page:import('@playwright/test').Page){
  await page.evaluate(async()=>{
    localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
      schemaVersion:1,cards:[{id:'918760001',name:'RS－미러',theme:'검증',effect:'효과',source:'테스트'}],
      decks:[{name:'미러덱',main:['918760001'],extra:[],side:[],source:'테스트'}]
    }));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const r=indexedDB.open('유희왕_DESIGN_LAB_자료실',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('files','readwrite');
      tx.objectStore('files').put({id:'sha-001',sha256:'sha-001',name:'검수.ydk',
        blob:new Blob(['#main\n918760001\n'],{type:'text/plain'}),size:21,createdAt:1});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  });
}
test('V2.7: 공통 카드·덱 + DESIGN LAB Blob 파일을 SHA-256 ZIP으로 묶고 신규만 복원',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await openBackup(page);await setup(page);
  const outgoing=page.waitForEvent('download');
  await page.getByRole('button',{name:'현재 통합 자료 ZIP 다운로드'}).click();
  const download=await outgoing;
  expect(download.suggestedFilename()).toMatch(/^YGO_STUDIO_통합작업실_백업_\d{4}-\d{2}-\d{2}\.zip$/);
  const buffer=await readFile(await download.path()!);
  const zip=await JSZip.loadAsync(buffer);
  const manifest=JSON.parse(await zip.file('백업목록.json')!.async('string')) as {
    format:string;records:Array<{dataset:string;path:string;sha256:string;bytes:number}>;
    blobs:Array<{path:string;sha256:string}>;
  };
  expect(manifest.format).toBe('YGO_STUDIO_SNAPSHOT_V1');
  expect(manifest.records.map(x=>x.dataset)).toContain('shared');
  expect(manifest.records.map(x=>x.dataset)).toContain('designlab-files');
  expect(manifest.blobs.length).toBeGreaterThanOrEqual(1);
  for(const entry of [...manifest.records,...manifest.blobs]){
    const data=await zip.file(entry.path)!.async('nodebuffer');
    expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
  }
  // Delete just one original key, and verify the archive never overwrites an existing key.
  await page.evaluate(()=>localStorage.removeItem('ygo-studio-shared-catalog-v1'));
  await page.getByLabel('YGO STUDIO 통합 백업 ZIP').setInputFiles({name:'백업_검증.zip',mimeType:'application/zip',buffer});
  await expect(page.getByRole('region',{name:'복원 미리보기'})).toContainText('공통 카드·덱 보관함');
  await expect(page.getByRole('region',{name:'복원 미리보기'})).toContainText('신규 1 / 기존 0');
  const before=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('유희왕_DESIGN_LAB_자료실');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const row=await new Promise<{name:string}>((resolve,reject)=>{
      const r=db.transaction('files').objectStore('files').get('sha-001');
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    db.close();return row.name;
  });
  expect(before).toBe('검수.ydk');
  await page.getByRole('button',{name:'선택한 신규 데이터만 복원'}).click();
  await expect(page.getByText('신규 1건 복원',{exact:false})).toBeVisible();
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ygo-studio-shared-catalog-v1')||'null'));
  expect(restored.cards[0].name).toBe('RS－미러');
  expect(restored.decks[0].main).toEqual(['918760001']);
});

test('V2.7: 무결성 불일치 ZIP 복원을 차단하고 기존 공통 카드 메타 보호',async({page})=>{
  await openBackup(page);await setup(page);
  const outgoing=page.waitForEvent('download');
  await page.getByRole('button',{name:'현재 통합 자료 ZIP 다운로드'}).click();
  const download=await outgoing;
  const zip=await JSZip.loadAsync(await readFile(await download.path()!));
  const manifest=JSON.parse(await zip.file('백업목록.json')!.async('string')) as {
    records:Array<{path:string;dataset:string}>
  };
  const shared=manifest.records.find(r=>r.dataset==='shared')!;
  zip.file(shared.path,JSON.stringify({dataset:'shared',key:'bad',value:'{}'}));
  const modified=await zip.generateAsync({type:'nodebuffer'});
  await page.getByLabel('YGO STUDIO 통합 백업 ZIP').setInputFiles({
    name:'손상_백업.zip',mimeType:'application/zip',buffer:modified
  });
  await expect(page.getByRole('alert').filter({hasText:'SHA-256 검증 실패'})).toBeVisible();
  await expect(page.getByRole('button',{name:'선택한 신규 데이터만 복원'})).toHaveCount(0);
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('ygo-studio-shared-catalog-v1')||'null'));
  expect(current.cards[0].name).toBe('RS－미러');
});
