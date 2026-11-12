import { test,expect } from '@playwright/test';

test('V2.3: 네 작업실을 한 사이트의 전체 화면으로 전환하고 복귀한다',async({page})=>{
  await page.goto('/ygocardganri/');
  const originalUrl=page.url();
  const viewport=page.viewportSize()!;
  const open=async(name:string)=>{
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('button',{name:'스튜디오로 돌아가기'})).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('.studio-v2 > .main-area > .topbar')).toHaveCount(0);
    await expect(page.locator('.studio-v2 .content')).toHaveCount(0);
    await expect(page.locator('.studio-v2 .footer')).toHaveCount(0);
    const shell=page.locator('.studio-fullscreen');
    await expect(shell).toBeVisible();
    const bounds=await shell.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBeGreaterThanOrEqual(viewport.width-1);
  };
  const close=async()=>{
    await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
    await expect(page.getByRole('button',{name:'대시보드',exact:true})).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.studio-fullscreen')).toHaveCount(0);
    expect(page.url()).toBe(originalUrl);
  };

  await open('이미지 연구소');
  const art=page.locator('[data-native-tool="artlab"]');
  await expect(art.locator('#art-canvas')).toBeVisible({timeout:30000});
  await expect(art.locator('.topbar .brand')).toBeVisible();
  await expect(art.locator('.footer')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await close();

  await open('카드 렌더러');
  const maker=page.locator('[data-native-tool="cardmaker"]');
  await expect.poll(()=>maker.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0),{timeout:30000}).toBe(1);
  await expect(maker.locator('.topbar .brand')).toBeVisible();
  await expect(maker.locator('.workspace')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await close();

  await open('디자인·덱 실험실');
  const nativeLab=page.locator('[data-native-tool="designlab"]');
  await expect(nativeLab).toBeVisible();
  await expect(nativeLab.locator('#view-library')).toBeVisible({timeout:30000});
  await expect(nativeLab.locator('#assets-open')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await close();

  await open('PSH 검증 관제실');
  const frame=page.locator('iframe[title="PSH 검증 관제실"]');
  await expect(frame).toHaveAttribute('src','/ygocardganri/modules/arena/');
  await expect(page.frameLocator('iframe[title="PSH 검증 관제실"]').locator('body')).toContainText('MSG16 응답 이후',{timeout:20000});
  const box=await frame.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(viewport.width-1);
  await close();
});

test('V2.3: 공통 보관함에서 진입한 뒤에는 해당 화면으로 돌아온다',async({page})=>{
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
  await page.getByRole('button',{name:'카드 렌더러',exact:true}).click();
  await expect(page.getByRole('button',{name:'스튜디오로 돌아가기'})).toBeVisible();
  await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  await expect(page.getByRole('heading',{name:'공통 카드·덱 보관함'})).toBeVisible();
});
