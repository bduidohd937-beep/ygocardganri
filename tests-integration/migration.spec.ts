import { test,expect } from '@playwright/test';

test('V2.1: 카드 렌더러 백업 검수→원본 SHA-256 보관→공통 카드 신규만 이전',async({page})=>{
  await page.goto('/ygocardganri/');
  await page.locator('.sidebar .nav-link').filter({hasText:'기존 사이트 데이터 이전'}).click();
  await expect(page.getByRole('heading',{name:'기존 사이트 데이터 이전 센터'})).toBeVisible();
  const file={version:1,name:'테스트_렌더러',cards:[
    {id:918760001,name:'RS－오리온',theme:'아칠리쉬',effect:'효과 원문',frame:'effect',artwork:'data:image/png;base64,AA=='}
  ]};
  const input=page.getByLabel('이전 원본 파일 선택');
  await input.setInputFiles({name:'원본_카드메이커.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  await expect(page.getByText('원본_카드메이커.json').first()).toBeVisible();
  await expect(page.getByText('카드 렌더러 프로젝트').first()).toBeVisible();
  await page.getByRole('button',{name:/정상 파일을 원본 그대로 보관/}).click();
  await expect(page.getByText(/원본 1개 저장 및 SHA-256 재검증 완료/)).toBeVisible();
  await page.getByRole('button',{name:'공통 메타 병합 검토'}).click();
  await expect(page.getByRole('region',{name:'데이터 병합 검토'})).toContainText('신규 카드');
  await page.getByRole('button',{name:'검토 내용대로 신규 메타만 병합'}).click();
  await expect(page.getByRole('status')).toContainText('공통 카드 1장');
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('ygo-studio-shared-catalog-v1')||'null'));
  expect(current.cards[0]).toMatchObject({id:'918760001',name:'RS－오리온'});
  expect(current.cards[0].artwork).toBeUndefined();
  await expect(page.getByText('공통카드덱_이전전_자동보존.json')).toBeVisible();
});

test('V2.1: 동일 해시 중복 제외 및 ZIP으로 원본 묶음 내보내기',async({page})=>{
  await page.goto('/ygocardganri/');
  await page.locator('.sidebar .nav-link').filter({hasText:'기존 사이트 데이터 이전'}).click();
  const upload=page.getByLabel('이전 원본 파일 선택');
  const file={name:'복원 데이터',version:1,cards:[{id:918760002,name:'테스트',theme:'연구',frame:'effect'}]};
  const item={name:'테스트원본.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))};
  await upload.setInputFiles(item);
  await page.getByRole('button',{name:/정상 파일을 원본 그대로 보관/}).click();
  await expect(page.getByRole('status')).toContainText('원본 1개 저장');
  await upload.setInputFiles(item);
  await expect(page.getByText('중복 원본').first()).toBeVisible();
  await page.getByRole('button',{name:/정상 파일을 원본 그대로 보관/}).click();
  await expect(page.getByRole('status')).toContainText('동일 파일 1개 중복 제외');
  const exported=page.waitForEvent('download');
  await page.getByRole('button',{name:/원본 전체 ZIP 내보내기/}).click();
  const download=await exported;
  expect(download.suggestedFilename()).toBe('YGO_STUDIO_기존사이트_원본백업_모음.zip');
  await expect(page.getByRole('status')).toContainText('ZIP 내보내기를 시작했습니다');
});

test('V2.1: JSON 검증 실패 파일은 정상 백업으로 확정하지 않는다',async({page})=>{
  await page.goto('/ygocardganri/');
  await page.locator('.sidebar .nav-link').filter({hasText:'기존 사이트 데이터 이전'}).click();
  await page.getByLabel('이전 원본 파일 선택').setInputFiles({name:'손상.json',mimeType:'application/json',buffer:Buffer.from('{unclosed')});
  await expect(page.getByText('검증 실패').first()).toBeVisible();
  await expect(page.getByRole('button',{name:/정상 파일을 원본 그대로 보관/})).toBeDisabled();
  await expect(page.getByText('보관된 원본 · 복원 검토')).toBeVisible();
});
