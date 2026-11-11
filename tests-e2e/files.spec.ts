import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

async function cdbFixture(){
  const SQL=await initSqlJs();
  const db=new SQL.Database();
  db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
  db.run('INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, \'실험용 카드\', \'테스트 효과 텍스트\')');
  const result=db.export();db.close();return Buffer.from(result);
}

const lua='local s,id=GetID()\nfunction s.initial_effect(c)\nend\n';
const deck='#created by e2e\n#main\n91008601\n91008601\n#extra\n!side\n';

test('P2: 신규 테마 만들기 → CDB/Lua/YDK 파일 분석 → 보관 → 재진입 및 원본 다운로드',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('코스모코드');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await expect(page.locator('.fc-theme-card')).toHaveCount(2);
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'코스모코드'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'custom.cdb',mimeType:'application/octet-stream',buffer:await cdbFixture()},
    {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from(lua)},
    {name:'예시_덱.ydk',mimeType:'text/plain',buffer:Buffer.from(deck)},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await expect(page.locator('.fc-preview-list>div')).toHaveCount(3);
  await expect(page.locator('.fc-preview-list')).toContainText('c91008601.lua');
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(3);
  await expect(page.locator('.fc-index-list').first()).toContainText('실험용 카드');
  await expect(page.locator('.fc-index-list').last()).toContainText('메인 2');
  // Original five world card documents remain independent and untouched.
  await page.locator('.sidebar .nav-link').filter({hasText:'카드 라이브러리'}).click();
  await expect(page.locator('.results-count')).toContainText('16개');
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'코스모코드'});
  await page.reload();
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'코스모코드'});
  await expect(page.locator('.fc-file-row')).toHaveCount(3);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('.fc-file-row').filter({hasText:'c91008601.lua'}).getByRole('button',{name:'원본'}).click();
  const downloaded=await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe('c91008601.lua');
});

test('P2: ZIP 내부 파일 처리, 위험 파일과 손상 CDB는 등록 거부',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  const zip=new JSZip();
  zip.file('scripts/c10005001.lua',lua);
  zip.file('decks/test.ydk',deck);
  zip.file('notes/readme.exe','unsupported');
  const bytes=Buffer.from(await zip.generateAsync({type:'uint8array'}));
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'샘플.zip',mimeType:'application/zip',buffer:bytes},
    {name:'broken.cdb',mimeType:'application/octet-stream',buffer:Buffer.from('invalid SQLite')},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible();
  await expect(page.locator('.fc-preview')).toContainText('ZIP');
  await expect(page.locator('.fc-preview')).toContainText('CDB');
  await expect(page.locator('.fc-preview')).toContainText('SQLite');
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(3); // 2 extracted + original ZIP, no broken CDB
});