import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('V2.6: PSH 네이티브 관제실은 iframe 없이 원본 화면·탭·기록을 표시한다',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/ygocardganri/');
  await page.locator('.sidebar').getByRole('button',{name:'PSH 검증 관제실',exact:true}).click();
  const arena=page.locator('[data-native-tool="arena"]');
  await expect(arena.locator('#nav')).toBeVisible({timeout:30000});
  await expect(arena.locator('#content')).toContainText('MSG16 응답 이후');
  await expect(page.locator('iframe')).toHaveCount(0);
  const tabs=[
    ['sessions','경기 세션'],['issues','결함'],['diagnostics','교착 분석']
  ] as const;
  for(const [id,title] of tabs){
    await arena.locator('[data-tab="'+id+'"]').first().click();
    await expect(arena.locator('#heading')).toContainText(title);
    await expect(arena.locator('#content')).not.toBeEmpty();
  }
  await arena.locator('[data-tab="overview"]').first().click();
  await expect(arena.locator('#content')).toContainText('ISSUE-001');
  expect(errors).toEqual([]);
});

test('V2.6: 기록 JSON 백업 및 localStorage 원본 키 보존, 복귀 후 재진입',async({page})=>{
  await page.goto('/ygocardganri/');
  const entry=()=>page.locator('.sidebar').getByRole('button',{name:'PSH 검증 관제실',exact:true});
  await entry().click();
  const arena=page.locator('[data-native-tool="arena"]');
  await expect(arena.locator('#nav')).toBeVisible({timeout:30000});
  const downloadPromise=page.waitForEvent('download');
  await arena.locator('[data-action="export-json"]').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/PSH_AI_ARENA.*\.json$/);
  const body=JSON.parse(await readFile(await download.path()!, 'utf8')) as {schemaVersion:number;data:{issues:Array<{id:string}>;sessions:Array<{completedGames:number}>}};
  expect(body.schemaVersion).toBe(1);
  expect(body.data.issues.some(x=>x.id==='ISSUE-001')).toBe(true);
  expect(body.data.sessions[0].completedGames).toBe(0);

  page.on('dialog',dialog=>void dialog.accept());
  await arena.locator('[data-action="reset"]').click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('psh-ai-arena-control-v1')||'null'));
  expect(stored?.issues?.some((item:{id:string})=>item.id==='ISSUE-001')).toBe(true);
  await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  await entry().click();
  await expect(arena.locator('#content')).toContainText('MSG16 응답 이후',{timeout:30000});
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('psh-ai-arena-control-v1')||'null'));
  expect(after.issues.length).toBe(stored.issues.length);
});
