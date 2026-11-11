import { expect,test } from '@playwright/test';
import initSqlJs from 'sql.js';
async function fixture(){
  const SQL=await initSqlJs();const db=new SQL.Database();
  db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
  db.run("INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, 'P4 테스트 카드', '이 카드명의 ①의 효과는 1턴에 1번밖에 사용할 수 없다. ①: 덱에서 카드 1장을 패에 넣는다.')");
  const bytes=Buffer.from(db.export());db.close();return bytes;
}

test('P4: imported CDB/Lua evidence → static analyzer → persistent manual triage and JSON report',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('dialog',dialog=>void dialog.accept('근거: Lua ID 일치성 확인 필요'));
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P4 검수 실험 테마');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P4 검수 실험 테마'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'p4.cdb',mimeType:'application/octet-stream',buffer:await fixture()},
    {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from('local s,id=GetID()\nfunction c12345.initial_effect(c)\n e1:SetTarget(s.missing)\nend\n')},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(2);
  await page.locator('.fc-open-index').filter({hasText:'P4 테스트 카드'}).click();
  await page.getByRole('button',{name:'정적 오류 분석'}).click();
  await page.getByRole('button',{name:'이 카드 분석 실행'}).click();
  try { await expect(page.locator('.audit-rule').filter({hasText:'LUA_ID_MISMATCH'})).toHaveCount(1); }
  catch(e) {
    const errors=await page.locator('.audit-error').allTextContents();
    const progress=await page.locator('.audit-progress').allTextContents();
    const report=await page.locator('.audit-coverage').allTextContents();
    const root=await page.locator('.audit-root').allTextContents();
    const studio=await page.locator('.iw-root').allTextContents();
    throw new Error('P4 audit did not render: '+JSON.stringify({errors,progress,report,root:root.map(s=>s.slice(0,900)),studio:studio.map(s=>s.slice(0,400)),url:page.url(),pageErrors})+' / '+String(e));
  }
  await expect(page.locator('.audit-rule').filter({hasText:'COUNT_LIMIT_REVIEW'})).toHaveCount(1);
  await page.getByLabel('LUA_ID_MISMATCH 검토 상태').selectOption('조치 필요');
  await expect(page.locator('.audit-decision')).toContainText('조치 필요');
  const reportPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'JSON 보고서'}).click();
  const report=await reportPromise;expect(report.suggestedFilename()).toContain('정적검수');
  await page.reload();
  await page.locator('.sidebar .nav-link').filter({hasText:'오류 분석'}).click();
  await page.getByLabel('정적 분석 대상 테마').selectOption({label:'P4 검수 실험 테마'});
  await page.getByRole('button',{name:'선택한 테마 정적 분석'}).click();
  await expect(page.locator('.audit-rule').filter({hasText:'LUA_ID_MISMATCH'})).toHaveCount(1);
  await expect(page.getByLabel('LUA_ID_MISMATCH 검토 상태')).toHaveValue('조치 필요');
  await expect(page.getByText(/실제 검증이 통과했다는 의미는 아니야/)).toHaveCount(0); // No claim of automatic certification.
  await page.locator('.sidebar .nav-link').filter({hasText:'카드 라이브러리'}).click();
  await page.locator('.card-row').filter({hasText:'피를 갈구하는 자－아벨'}).click();
  await expect(page.locator('.iw-root')).toHaveCount(0);
});