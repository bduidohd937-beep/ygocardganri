import { test, expect } from '@playwright/test';

test('로컬 ZIP과 동일한 카드메이커를 YGO STUDIO에서 실행한다', async ({ page }) => {
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')pageErrors.push(msg.text());});
  await page.goto('/ygocardganri/');
  await page.getByRole('button', { name: '카드 렌더러', exact: true }).click();

  const tool = page.locator('[data-native-tool="cardmaker"]');
  await page.waitForTimeout(1500);
  console.log('[native card diagnostic]',JSON.stringify({
    errors:pageErrors,
    output:await tool.evaluate(el=>({
      dom:el.shadowRoot?.innerHTML.slice(0,1800),
      text:el.shadowRoot?.textContent?.slice(0,1300),
      options:el.shadowRoot?.querySelectorAll('select option[value="token"]').length,
    })),
    status:await page.locator('.native-workspace').first().innerText()
  }).slice(0,5500));
  await expect.poll(async()=>{
    const error=await page.locator('.native-workspace-error').first().textContent().catch(()=>null);
    if(error)throw Error(error+' / JS errors: '+pageErrors.join(' | ').slice(0,1200));
    return await tool.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0);
  },{timeout:20000}).toBe(1);

  // 로컬 ZIP에서 확인한 신규 기능: 토큰 프레임과 카드 리소스 ZIP 분류.
  await expect(tool.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0)).resolves.toBe(1);
  await expect(tool.getByText('카드 프레임 ZIP 불러오기')).toBeVisible();

  // 카드 프레임 선택 변경은 실제 카드 데이터의 명시적인 사용자 편집이다.
  // 테스트 프로젝트는 브라우저별 임시 데이터이며 CDB/Lua 파일과 무관하다.
  await tool.evaluate(el=>{
    const root=el.shadowRoot;
    if(!root)throw Error('렌더러 ShadowRoot 누락');
    const label=Array.from(root.querySelectorAll('label.field')).find(x=>x.textContent?.includes('카드 프레임'));
    const select=label?.querySelector('select');
    if(!select)throw Error('카드 프레임 선택창 누락');
    select.value='token';
    select.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
  });
  await expect(tool.getByText('토큰은 효과로 소환되는 카드입니다.', { exact: false })).toBeVisible();

  // 로컬 ZIP에는 crop editor도 포함. 데이터 없는 기본 일러스트에서 기능 확인만 한다.
  const tab = tool.getByRole('tab', { name: '일러스트', exact: true });
  await tab.click();
  await expect(tool.getByRole('button', { name: '고급 자르기 · 영역 직접 선택' })).toBeVisible();
});
