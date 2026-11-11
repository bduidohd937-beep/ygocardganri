import { expect, test } from '@playwright/test';
import initSqlJs from 'sql.js';

async function cdb(){
  const SQL=await initSqlJs();const db=new SQL.Database();
  db.run('CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER, level INTEGER); CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, "desc" TEXT)');
  db.run("INSERT INTO datas VALUES (91008601, 17, 4); INSERT INTO texts VALUES (91008601, '번호효과 연결 검수 카드', '이 카드명의 ①의 효과는 1턴에 1번만 사용할 수 있다. ①: 덱에서 카드 1장을 패에 넣는다. ②: 필드의 카드 1장을 파괴한다.')");
  const bytes=Buffer.from(db.export());db.close();return bytes;
}
const lua=`local s,id=GetID()
function s.initial_effect(c)
 local e1=Effect.CreateEffect(c)
 e1:SetOperation(s.destroy)
 c:RegisterEffect(e1)
 local e2=Effect.CreateEffect(c)
 e2:SetOperation(s.add)
 c:RegisterEffect(e2)
end
function s.add(e,tp) Duel.SendtoHand(g,nil,REASON_EFFECT) end
function s.destroy(e,tp) Duel.Destroy(g,REASON_EFFECT) end`;

test('P4.3 effect ① maps to Lua e2; effect ② maps to e1 without relying on variable order',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P4.3 번호별 연구 테마');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P4.3 번호별 연구 테마'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'mapping.cdb',mimeType:'application/octet-stream',buffer:await cdb()},
    {name:'c91008601.lua',mimeType:'text/plain',buffer:Buffer.from(lua,'utf8')},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(2);
  await page.locator('.fc-open-index').filter({hasText:'번호효과 연결 검수 카드'}).click();
  await page.getByRole('button',{name:'정적 오류 분석'}).click();
  await page.getByRole('button',{name:'이 카드 분석 실행'}).click();
  const root=page.locator('.link-root');
  await expect(root).toBeVisible();
  await expect(root.locator('.link-effect')).toHaveCount(2);
  const first=root.locator('.link-effect').nth(0);
  const second=root.locator('.link-effect').nth(1);
  await expect(first.locator('.link-effect-index')).toHaveText('①');
  await expect(first.locator('.link-mapping .link-code').first()).toHaveText('e2');
  await expect(first.locator('.link-mapping .link-code').last()).toHaveText('s.add');
  await expect(second.locator('.link-effect-index')).toHaveText('②');
  await expect(second.locator('.link-mapping .link-code').first()).toHaveText('e1');
  await expect(second.locator('.link-mapping .link-code').last()).toHaveText('s.destroy');
  await expect(root.locator('.link-status--matched')).toHaveCount(2);
  await expect(page.locator('.audit-coverage')).toContainText('P4.3-effect-link-v1');
  await page.reload();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P4.3 번호별 연구 테마'});
  await expect(page.locator('.fc-file-row')).toHaveCount(2);
});