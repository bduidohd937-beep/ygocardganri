import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js';
import { readFile } from 'node:fs/promises';

async function cdbFixture() {
  const SQL=await initSqlJs();const db=new SQL.Database();
  db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
  db.run("INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, 'P4.1 테스트 카드', '①: 덱에서 카드를 1장 패에 넣는다.')");
  const bytes=Buffer.from(db.export());db.close();return bytes;
}
test('P4.1 Lua AST patch preview → manual approval → separate exported Lua; no source overwrite',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept(dialog.type()==='prompt'?'검토: ID 비교 후 별도 EDOPro 실험 예정':undefined));
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P4.1 Lua 테스트 테마');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P4.1 Lua 테스트 테마'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'test.cdb',mimeType:'application/octet-stream',buffer:await cdbFixture()},
    {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from('function c12345.initial_effect(c)\nend\n')},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(2);
  await page.locator('.fc-open-index').filter({hasText:'P4.1 테스트 카드'}).click();
  await page.getByRole('button',{name:'정적 오류 분석'}).click();
  await page.getByRole('button',{name:'이 카드 분석 실행'}).click();
  await expect(page.locator('.audit-rule').filter({hasText:'AST_NAMESPACE_MISMATCH'})).toHaveCount(1);
  const finding=page.locator('.audit-finding').filter({hasText:'AST_NAMESPACE_MISMATCH'});
  await finding.getByRole('button',{name:'수정 전후 비교'}).click();
  await expect(finding.locator('.lua-patch-diff')).toContainText('c12345');
  await expect(finding.locator('.lua-patch-diff')).toContainText('c91008601');
  const downloadEvent=page.waitForEvent('download');
  await finding.getByRole('button',{name:/근거 입력·수동 승인 후 별도 파일 내보내기/}).click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe('검토안_c91008601.lua');
  const location=await download.path();expect(location).toBeTruthy();
  const exported=await readFile(location!,'utf8');
  expect(exported).toContain('function c91008601.initial_effect(c)');
  expect(exported).not.toContain('function c12345.initial_effect(c)');
  await expect(finding.locator('.audit-decision')).toContainText('수정안 내보내기 승인(수동)');
  await page.reload();
  await page.locator('.sidebar .nav-link').filter({hasText:'오류 분석'}).click();
  await page.getByLabel('정적 분석 대상 테마').selectOption({label:'P4.1 Lua 테스트 테마'});
  await page.getByRole('button',{name:'선택한 테마 정적 분석'}).click();
  const again=page.locator('.audit-finding').filter({hasText:'AST_NAMESPACE_MISMATCH'});
  await expect(again.locator('.audit-decision')).toContainText('수정안 내보내기 승인(수동)');
});
