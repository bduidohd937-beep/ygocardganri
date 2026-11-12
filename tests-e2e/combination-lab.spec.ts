import {expect,test} from '@playwright/test';
const ids=Array.from({length:20},(_,i)=>String(91008601+i));
const ydk=['#created by P5.1 combination fixture','#main',...ids.flatMap(id=>[id,id]),'#extra','!side',''].join('\n');

test('P5.1: A+B and alternative OR routes + brick risk persist in deck study without modifying original YDK',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P5.1 조합 분석 테스트');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P5.1 조합 분석 테스트'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'P5_메인40.ydk',mimeType:'text/plain',buffer:Buffer.from(ydk)},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(1);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await expect(page.locator('.decklab-shell')).toBeVisible();
  await page.getByRole('button',{name:'원본에서 새 분석안'}).click();
  await expect(page.getByLabel('조합 초동 분석기')).toBeVisible();
  await expect(page.locator('.combo-pending')).toBeVisible();

  await page.getByLabel('새 루트 A 카드').selectOption('91008601');
  await page.getByRole('button',{name:'루트 추가'}).click();
  await expect(page.locator('.combo-route')).toHaveCount(1);
  await page.locator('.combo-route').first().locator('input[aria-label$=" B 그룹"]').fill('91008602');
  await page.locator('.combo-route').first().getByRole('button',{name:/조건 적용/}).click();
  await expect(page.locator('.combo-route').first()).toContainText('서로 다른 실제 카드 2장');

  await page.getByLabel('새 루트 A 카드').selectOption('91008603');
  await page.getByRole('button',{name:'루트 추가'}).click();
  await expect(page.locator('.combo-route')).toHaveCount(2);
  const combo=page.getByLabel('조합 초동 분석기');
  await expect(combo.getByText('하나 이상의 루트 성립 (OR)')).toBeVisible();
  await expect(combo.locator('.combo-per-route>div')).toHaveCount(2);
  await page.getByLabel('조합 말림 카드 ID').fill('91008604');
  await page.getByRole('button',{name:'위험 카드 적용'}).click();
  await expect(combo.getByText('루트 성립 + 말림 동반')).toBeVisible();
  await expect(combo.locator('.combo-result-grid')).toContainText('%');
  await page.getByRole('button',{name:'분석안 저장'}).click();
  await expect(page.locator('.decklab-save-state')).toContainText('저장된 분석안');

  await page.reload();
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByLabel('저장된 분석안').selectOption({index:1});
  await expect(page.locator('.combo-route')).toHaveCount(2);
  await expect(page.locator('.combo-route').first().locator('input[aria-label$=" B 그룹"]')).toHaveValue('91008602');
  await expect(page.getByLabel('조합 말림 카드 ID')).toHaveValue('91008604');
  await expect(page.getByText('루트 성립 + 말림 동반')).toBeVisible();

  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P5.1 조합 분석 테스트'});
  await expect(page.locator('.fc-index-list')).toContainText('메인 40');
});
