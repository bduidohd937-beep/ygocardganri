import {test,expect} from '@playwright/test';

test('V2.5 DESIGN LAB: iframe 없이 원본 카드·검수·덱 작업실 전환',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/ygocardganri/');
  const url=page.url();
  await page.getByRole('button',{name:'디자인·덱 실험실',exact:true}).click();
  const lab=page.locator('[data-native-tool="designlab"]');
  await expect(lab.locator('#view-library')).toBeVisible({timeout:30000});
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(lab.locator('#assets-open')).toBeEnabled();
  await expect(lab.locator('#tab-audit')).toBeVisible();

  await lab.locator('#tab-audit').click();
  await expect(lab.locator('#view-audit')).toBeVisible();
  await expect(lab.locator('#view-library')).toBeHidden();
  await lab.locator('#tab-deck').click();
  await expect(lab.locator('#view-deck')).toBeVisible();
  await lab.locator('#tab-library').click();
  await expect(lab.locator('#view-library')).toBeVisible();

  expect(page.url()).toBe(url);
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  await expect(page.getByRole('button',{name:'디자인·덱 실험실',exact:true})).toBeVisible();
});

test('V2.5 DESIGN LAB: 원본 YDK 저장 후 복귀·재입장해도 IndexedDB 보존',async({page})=>{
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'디자인·덱 실험실',exact:true}).click();
  const lab=page.locator('[data-native-tool="designlab"]');
  await expect(lab.locator('#assets-open')).toBeEnabled({timeout:30000});
  const unique='V25_검증_덱.ydk';
  const input=lab.locator('#assets-input');
  await input.setInputFiles({name:unique,mimeType:'text/plain',
    buffer:Buffer.from('#created by YGO STUDIO\n#main\n918760001\n918760001\n#extra\n918760112\n!side\n')});
  await lab.locator('#assets-open').click();
  await expect(lab.locator('#assets-dialog')).toBeVisible();
  await expect(lab.locator('#assets-list')).toContainText(unique,{timeout:15000});
  await lab.locator('#assets-close').click();

  await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  await page.getByRole('button',{name:'디자인·덱 실험실',exact:true}).click();
  await expect(lab.locator('#assets-open')).toBeEnabled({timeout:30000});
  await lab.locator('#assets-open').click();
  await expect(lab.locator('#assets-list')).toContainText(unique,{timeout:15000});
  await lab.locator('#assets-close').click();
  await lab.locator('#tab-deck').click();
  await expect(lab.locator('#view-deck')).toBeVisible();
});
