import { expect,test } from '@playwright/test';
import initSqlJs from 'sql.js';
async function fixture(){
  const SQL=await initSqlJs();const db=new SQL.Database();
  db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
  db.run('INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, \'P3 검증 카드\', \'①: 이 카드를 패에 넣는다.\')');
  const output=Buffer.from(db.export());db.close();return output;
}
test('P3: 외부 테마 카드 → CDB 후보 → 명시 승인 → 검수 기록 → 재접속',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('통합 테스트 카드군');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'통합 테스트 카드군'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'P3_sample.cdb',mimeType:'application/octet-stream',buffer:await fixture()},
    {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from('local s,id=GetID()\nfunction s.initial_effect(c)\nend\n')},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(2);
  await page.locator('.fc-open-index').filter({hasText:'P3 검증 카드'}).click();
  await expect(page.locator('.iw-root')).toBeVisible();
  await expect(page.locator('.iw-text--approved')).toContainText('미확인');
  await expect(page.getByText('①: 이 카드를 패에 넣는다.')).toBeVisible();
  await expect(page.locator('.iw-source')).toHaveCount(1);
  await page.getByRole('button',{name:/이 원문으로 미승인 제안 작성/}).click();
  await expect(page.locator('.editor-module--proposal textarea')).toHaveValue('①: 이 카드를 패에 넣는다.');
  await page.getByRole('button',{name:'미승인 제안 저장'}).click();
  await expect(page.locator('.iw-text--approved')).toContainText('미확인');
  await page.getByRole('button',{name:'명시 승인'}).click();
  await expect(page.locator('.iw-text--approved')).toContainText('①: 이 카드를 패에 넣는다.');
  await page.getByLabel('Lua 스크립트 검수 상태').selectOption('진행중');
  await page.getByRole('button',{name:'파일 · Lua'}).click();
  await expect(page.locator('.iw-code')).toContainText('initial_effect');
  await page.reload();
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'카드 라이브러리'}).click();
  await expect(page.locator('.results-count')).toContainText('16개');
  await page.locator('.fc-workbench-list').last().getByRole('button',{name:/P3 검증 카드/}).click();
  await expect(page.locator('.iw-text--approved')).toContainText('①: 이 카드를 패에 넣는다.');
  await expect(page.getByLabel('Lua 스크립트 검수 상태')).toHaveValue('진행중');
  await page.getByRole('button',{name:'변경 이력'}).last().click();
  await expect(page.locator('.iw-history-row')).toHaveCount(4);
  await page.getByRole('button',{name:/카드 라이브러리/}).last().click();
  await page.locator('.card-row').filter({hasText:'피를 갈구하는 자－아벨'}).click();
  await expect(page.locator('.iw-root')).toHaveCount(0);
  await expect(page.getByText('현재 등록된 효과 원문이 없습니다.')).toBeVisible();
});