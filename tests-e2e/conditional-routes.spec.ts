import { expect,test } from '@playwright/test';
const ids=Array.from({length:20},(_,i)=>String(91008601+i));
const ydk=['#created by P5.2 conditional-routes fixture','#main',...ids.flatMap(id=>[id,id]),'#extra','!side',''].join('\n');

test('P5.2: conditional A+B, forbidden hand and resource minimum survive reload; original YDK remains intact',async({page})=>{
  const browserErrors:string[]=[];
  page.on('pageerror',e=>browserErrors.push(e.message));
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P5.2 루트별 조건 시험');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P5.2 루트별 조건 시험'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'P5_2_조건연구.ydk',mimeType:'text/plain',buffer:Buffer.from(ydk)},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(1);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByRole('button',{name:'원본에서 새 분석안'}).click();
  const combo=page.locator('.combo-shell:visible');
  await expect(combo).toHaveCount(1);
  await expect(combo).toBeVisible();

  await combo.locator('select[aria-label="새 루트 A 카드"]').selectOption('91008601');
  await combo.getByRole('button',{name:'루트 추가'}).click();
  const first=combo.locator('.combo-route').first();
  await first.locator('input[aria-label$=" B 그룹"]').fill('91008602');
  await first.locator('input[aria-label$=" 금지 패 그룹"]').fill('91008604');
  await first.locator('input[aria-label$=" 추가 자원 그룹"]').fill('91008603');
  await first.locator('select[aria-label$=" 추가 자원 최소 매수"]').selectOption('1');
  await first.getByRole('button',{name:/조건 적용/}).click();
  await expect(first.locator('.combo-error')).toHaveCount(0);
  await expect(combo.getByText('하나 이상의 루트 성립 (OR)')).toBeVisible({timeout:30000});

  // Reject counting one starting card as both A and extra cost material.
  await first.locator('input[aria-label$=" 추가 자원 그룹"]').fill('91008601');
  await first.getByRole('button',{name:/조건 적용/}).click();
  await expect(first.locator('.combo-error')).toContainText('다른 ID');
  await first.locator('input[aria-label$=" 추가 자원 그룹"]').fill('91008603');
  await first.getByRole('button',{name:/조건 적용/}).click();
  await expect(first.locator('.combo-error')).toHaveCount(0);

  await combo.locator('select[aria-label="새 루트 A 카드"]').selectOption('91008605');
  await combo.getByRole('button',{name:'루트 추가'}).click();
  const second=combo.locator('.combo-route').nth(1);
  await second.locator('input[aria-label$=" 금지 패 그룹"]').fill('91008606');
  await second.locator('input[aria-label$=" 추가 자원 그룹"]').fill('91008607');
  await second.locator('select[aria-label$=" 추가 자원 최소 매수"]').selectOption('2');
  await second.getByRole('button',{name:/조건 적용/}).click();

  await combo.getByLabel('조합 말림 카드 ID').fill('91008608');
  await page.getByRole('button',{name:'위험 카드 적용'}).click();
  await expect(combo.getByText('루트 성립 + 말림 없음')).toBeVisible({timeout:30000});
  await expect(combo.locator('.combo-per-route>div')).toHaveCount(2);
  await expect(combo.locator('.combo-result-grid')).toContainText('%');
  await page.getByRole('button',{name:'분석안 저장'}).click();
  await expect(page.locator('.decklab-save-state')).toContainText('저장된 분석안');

  await page.reload();
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByLabel('저장된 분석안').selectOption({index:1});
  await expect(combo.locator('.combo-route')).toHaveCount(2);
  const one=combo.locator('.combo-route').first();
  await expect(one.locator('input[aria-label$=" B 그룹"]')).toHaveValue('91008602');
  await expect(one.locator('input[aria-label$=" 금지 패 그룹"]')).toHaveValue('91008604');
  await expect(one.locator('input[aria-label$=" 추가 자원 그룹"]')).toHaveValue('91008603');
  await expect(one.locator('select[aria-label$=" 추가 자원 최소 매수"]')).toHaveValue('1');
  await expect(combo.locator('.combo-route').nth(1).locator('select[aria-label$=" 추가 자원 최소 매수"]')).toHaveValue('2');
  await expect(combo.getByLabel('조합 말림 카드 ID')).toHaveValue('91008608');
  await expect(page.locator('.combo-result-grid')).toContainText('%',{timeout:30000});

  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P5.2 루트별 조건 시험'});
  await expect(page.locator('.fc-index-list')).toContainText('메인 40');
  expect(browserErrors).toEqual([]);
});
