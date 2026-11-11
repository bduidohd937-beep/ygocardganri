import { expect,test } from '@playwright/test';
import initSqlJs from 'sql.js';
async function cdb(){
 const SQL=await initSqlJs();const db=new SQL.Database();
 db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
 db.run("INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, '비교 테스트 카드', '①: 패에서 카드 1장을 버리고 발동할 수 있다. 1장을 대상으로 하고 발동할 수 있다. 덱에서 카드 1장을 패에 넣는다.')");
 const bytes=Buffer.from(db.export());db.close();return bytes;
}
test('P4.2 CDB-Lua compare shows review evidence and preserves original files',async({page})=>{
 await page.goto('/');await expect(page.locator('.realm-tile')).toHaveCount(5);
 await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
 await page.getByRole('button',{name:'새 테마'}).click();
 await page.getByPlaceholder('예: 코스모코드').fill('P4.2 비교 실험 테마');
 await page.getByRole('button',{name:'테마 등록'}).click();
 await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
 await page.locator('.fc-file-select select').selectOption({label:'P4.2 비교 실험 테마'});
 await page.locator('.fc-drop input[type=file]').setInputFiles([
  {name:'comparison.cdb',mimeType:'application/octet-stream',buffer:await cdb()},
  {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from('local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n c:RegisterEffect(e1)\nend\n')},
 ]);
 await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:/원본 보관 확정/}).click();
 await expect(page.locator('.fc-file-row')).toHaveCount(2);
 await page.locator('.fc-open-index').filter({hasText:'비교 테스트 카드'}).click();
 await page.getByRole('button',{name:'정적 오류 분석'}).click();
 await page.getByRole('button',{name:'이 카드 분석 실행'}).click();
 await expect(page.locator('.align-root')).toBeVisible();
 await expect(page.locator('.align-table-row')).toHaveCount(4);
 await expect(page.locator('.align-status--review')).toHaveCount(3);
 await expect(page.locator('.audit-rule').filter({hasText:'ALIGN_COST_REVIEW'})).toHaveCount(1);
 await expect(page.locator('.audit-rule').filter({hasText:'ALIGN_TARGET_REVIEW'})).toHaveCount(1);
 await expect(page.locator('.audit-rule').filter({hasText:'ALIGN_OPERATION_REVIEW'})).toHaveCount(1);
 await expect(page.locator('.align-root')).toContainText('동작');
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'JSON 보고서'}).click();
 const report=await download;expect(report.suggestedFilename()).toContain('정적검수');
 await page.reload();
 await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
 await page.locator('.fc-file-select select').selectOption({label:'P4.2 비교 실험 테마'});
 await expect(page.locator('.fc-file-row')).toHaveCount(2);
});