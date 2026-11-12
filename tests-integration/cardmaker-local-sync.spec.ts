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
  await page.waitForTimeout(3000);
  const after=await tool.evaluate(el=>({
    options:el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0,
    childCount:el.shadowRoot?.childNodes.length??0,
    cardNames:el.shadowRoot?.querySelectorAll('.card-summary').length??0,
    editorText:el.shadowRoot?.querySelector('.editor')?.textContent?.slice(0,500),
    hasApp:!!el.shadowRoot?.querySelector('.app-shell'),
    textLength:el.shadowRoot?.textContent?.length??0,
    htmlEnd:el.shadowRoot?.innerHTML.slice(-1300),
  }));
  console.log('[native after 3 sec]',JSON.stringify({after,pageErrors}));
  expect(after.options,'토큰 프레임이 사라지는 경우의 React 수명주기 상태').toBe(1);

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
