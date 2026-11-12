import { test,expect } from '@playwright/test';

test('YGO STUDIO: 카드 제작 두 도구는 iframe 없이 네이티브로 실행하고 연구 도구는 보존한다',async ({page})=>{
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'이미지 연구소',exact:true}).click();
  const art=page.locator('[data-native-tool="artlab"]');
  await expect(art).toBeVisible();
  await expect(art.locator('#art-canvas')).toBeVisible({timeout:30000});
  await expect(art.locator('#card-id')).toBeVisible();
  await expect(page.locator('iframe[title="이미지 연구소"]')).toHaveCount(0);
  await expect(page.getByText('한 화면에서 직접 실행')).toBeVisible();

  await page.getByRole('button',{name:'카드 렌더러',exact:true}).click();
  const maker=page.locator('[data-native-tool="cardmaker"]');
  await expect(maker).toBeVisible();
  await expect(maker.locator('select option[value="token"]')).toHaveCount(1,{timeout:30000});
  await expect(page.locator('iframe[title="카드 렌더러"]')).toHaveCount(0);

  for(const item of [
    {name:'디자인·덱 실험실',path:'designlab',content:'DESIGN LAB'},
    {name:'PSH 검증 관제실',path:'arena',content:'MSG16 응답 이후'}
  ]){
    await page.getByRole('button',{name:item.name,exact:true}).click();
    await expect(page.locator(`iframe[title="${item.name}"]`)).toHaveAttribute('src',`/ygocardganri/modules/${item.path}/`);
    await expect(page.frameLocator(`iframe[title="${item.name}"]`).locator('body')).toContainText(item.content,{timeout:20000});
  }
});
