import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
import {readFile} from 'node:fs/promises';

async function openGeneric(page:import('@playwright/test').Page){
  await page.goto('/');
  await page.getByRole('button',{name:'범용 카드 도감 바로 열기'}).click();
  await expect(page.getByRole('region',{name:'범용 카드 도감'})).toBeVisible();
}
test('메인 1클릭 도감 · 검색 · 채택·실전 독립 변경 · 저장 복원',async({page})=>{
  await openGeneric(page);
  await expect(page.getByText('검색 결과 9건')).toBeVisible();
  await page.getByLabel('범용 카드 검색').fill('919300104');
  await expect(page.getByText('검색 결과 1건')).toBeVisible();
  await page.getByRole('button',{name:/공역의 관측자－오르비아/}).click();
  await expect(page.getByLabel('도감 CDB 상태')).toHaveValue('제작 기록');
  await expect(page.getByLabel('도감 Lua 상태')).toHaveValue('제작 기록');
  await expect(page.getByLabel('도감 실전 상태')).toHaveValue('미검증');
  await page.getByLabel('도감 실전 상태').selectOption('검증 중');
  await page.getByLabel('도감 검증 메모').fill('실전 확인 예정');
  await expect(page.getByText('저장 완료')).toBeVisible();
  await page.reload();
  await page.locator('.sidebar .nav-link').filter({hasText:'범용 카드 도감'}).click();
  await page.getByLabel('범용 카드 검색').fill('919300104');
  await expect(page.getByLabel('도감 실전 상태')).toHaveValue('검증 중');
  await expect(page.getByLabel('도감 CDB 상태')).toHaveValue('제작 기록');
  await expect(page.getByLabel('도감 검증 메모')).toHaveValue('실전 확인 예정');
});
test('도감 ZIP: 한글 구조·원문·Lua 첨부·백업 복원',async({page},testInfo)=>{
  page.on('dialog',d=>void d.accept());
  await openGeneric(page);
  const lua=Buffer.from('local s,id=GetID()\nfunction s.initial_effect(c)\nend\n');
  await page.getByLabel('도감 Lua 첨부').setInputFiles({
    name:'c990470201.lua',mimeType:'text/plain',buffer:lua,
  });
  await expect(page.getByText(/도감에 Lua 첨부됨/)).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'전체 ZIP'}).click();
  const result=await downloadPromise;
  expect(result.suggestedFilename()).toBe('범용카드_도감_전체백업.zip');
  const path=testInfo.outputPath('범용_백업.zip');await result.saveAs(path);
  const zip=await JSZip.loadAsync(await readFile(path));
  expect(zip.file('범용카드_도감/범용카드_마스터목록.csv')).toBeTruthy();
  expect(zip.file('범용카드_도감/채택카드/990470201_정수약탈자_루미크론/c990470201.lua')).toBeTruthy();
  const text=await zip.file('범용카드_도감/채택카드/919300104_공역의_관측자－오르비아/검증기록.md')!.async('string');
  expect(text).toContain('실전: 미검증');
  await page.getByLabel('범용 도감 백업 복원').setInputFiles({name:'백업.zip',mimeType:'application/zip',buffer:await readFile(path)});
  await expect(page.getByRole('status')).toContainText('도감 9종과 첨부 1개를 복원했습니다.');
});