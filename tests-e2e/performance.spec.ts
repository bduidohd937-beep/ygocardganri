import { expect, test } from '@playwright/test';
import { createInitialData } from '../src/data';

test('real Chromium: the dashboard loads with the five established realms',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await expect(page.locator('.sidebar-bottom')).toContainText('로컬 워크스페이스');
  const paint=await page.evaluate(()=>performance.getEntriesByType('paint').map(p=>({name:p.name,ms:Math.round(p.startTime)})));
  console.log('[P0.5 Chromium] initial paint:',JSON.stringify(paint));
});

test('real Chromium: 10,000 synthetic cards render incrementally and search remains usable',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  // The first seed write is debounced; let it commit before replacing the local test DB.
  await page.waitForTimeout(750);
  await expect(page.locator('.sidebar-bottom')).toContainText('저장 완료');

  const seed=createInitialData();
  const source=seed.cards[0];
  seed.cards=Array.from({length:10_000},(_,i)=>({
    ...source, id:`synthetic-${i}`, name:`성능 카드 ${String(i).padStart(5,'0')}`,
    protectedName:false, confirmedName:false, proposals:[], effect:'',
  }));
  await page.evaluate(async fixture=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('ygo_card_studio',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('workspace','readwrite');
      tx.objectStore('workspace').put(fixture,'project_v1');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    db.close();
  },seed);
  const start=Date.now();
  await page.reload();
  await expect(page.locator('.sidebar-bottom')).toContainText('로컬 워크스페이스');
  await page.locator('.sidebar .nav-link').filter({hasText:'카드 라이브러리'}).click();
  await expect(page.locator('.card-row')).toHaveCount(60);
  await expect(page.locator('.results-count')).toContainText('10000');
  const searchStart=Date.now();
  await page.getByRole('textbox',{name:'카드 검색'}).fill('성능 카드 09999');
  await expect(page.locator('.card-row')).toHaveCount(1);
  await expect(page.locator('.card-row')).toContainText('성능 카드 09999');
  console.log(`[P0.5 Chromium] synthetic 10k reload+table: ${Date.now()-start}ms; search interaction: ${Date.now()-searchStart}ms (CI sample, not real-user INP)`);
});