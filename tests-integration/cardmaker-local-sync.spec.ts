import { test, expect } from '@playwright/test';

test('로컬 ZIP과 동일한 카드메이커를 YGO STUDIO에서 실행한다', async ({ page }) => {
  await page.goto('/ygocardganri/');
  await page.getByRole('button', { name: '카드 렌더러', exact: true }).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');

  // Wait for the original project's IndexedDB restoration and first React render.
  await page.waitForTimeout(3000);
  await expect(page.locator('.native-workspace-error')).toHaveCount(0);
  await expect(tool.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0)).resolves.toBe(1);

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
  await expect(tool.getByRole('button', { name: '3:4 간편 모드 열기' })).toHaveCount(0);
  await expect(tool.getByRole('button', { name: '돌출 PNG 업로드' })).toHaveCount(0);
  await tool.getByRole('tab', { name: '오버프레임', exact: true }).click();
  await expect(tool.getByRole('button', { name: '3:4 간편 모드 열기' })).toBeVisible();
  await expect(tool.getByRole('button', { name: '돌출 PNG 업로드' })).toBeVisible();
  await expect(tool.getByRole('button', { name: '고급 자르기 · 영역 직접 선택' })).toHaveCount(0);
});


test('YGO STUDIO 카드 렌더러 오버프레임 PNG 합성 및 사용 전환', async ({ page }) => {
  await page.goto('/ygocardganri/');
  await page.getByRole('button', { name: '카드 렌더러', exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');
  await expect(tool.getByRole('tab', { name: '일러스트', exact: true })).toBeVisible();
  const preview = tool.locator('canvas[role="img"]');
  await expect(preview).toBeVisible();
  const readPreview = () => preview.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL('image/png'));
  const withoutLayer = await readPreview();

  await tool.getByRole('tab', { name: '오버프레임', exact: true }).click();
  await expect(tool.locator('.section-label').filter({ hasText: '오버프레임' })).toBeVisible();
  await expect(tool.getByRole('button', { name: '돌출 PNG 업로드' })).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff00aa';
    ctx.fillRect(12, 12, 40, 40);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await tool.locator('input[aria-label="오버프레임 돌출 PNG 파일"]').setInputFiles({
    name: '오버프레임_돌출_검증.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const enabled = tool.getByRole('checkbox', { name: '프레임 돌출 사용' });
  await expect(enabled).toBeChecked();
  await expect(tool.locator('.overframe-editor input[type="range"]')).toHaveCount(4);
  await expect.poll(readPreview).not.toBe(withoutLayer);

  // Must compose the same background, frame, and text when the optional layer is disabled.
  await enabled.uncheck();
  await expect.poll(readPreview).toBe(withoutLayer);
  await enabled.check();
  await expect.poll(readPreview).not.toBe(withoutLayer);
});


test('오버프레임 V2: 카드 위 이동·지우개·되돌리기·저장', async ({ page }) => {
  await page.goto('/ygocardganri/');
  await page.getByRole('button', { name: '카드 렌더러', exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole('tab', { name: '오버프레임', exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff00aa';
    ctx.fillRect(0, 0, 96, 96);
    return c.toDataURL().split(',')[1];
  });
  await tool.locator('input[aria-label="오버프레임 돌출 PNG 파일"]').setInputFiles({
    name: '오버프레임_V2_테스트.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  });
  await tool.getByRole('button', { name: /정밀 편집 · 마스크/ }).click();
  await expect(tool.getByRole('dialog', { name: '오버프레임 정밀 편집' })).toBeVisible();
  const editor = tool.locator('canvas[aria-label="오버프레임 직접 편집 캔버스"]');
  await expect(editor).toBeVisible();
  const frame = () => editor.evaluate(el => (el as HTMLCanvasElement).toDataURL('image/png'));
  await expect.poll(async () => (await frame()).length).toBeGreaterThan(4000);
  const original = await frame();
  await tool.getByRole('button', { name: '지우개' }).click();
  await page.waitForTimeout(200);
  const box = await editor.boundingBox();
  if (!box) throw Error('오버프레임 편집기 캔버스가 없습니다.');
  await page.mouse.click(box.x + box.width * .5, box.y + box.height * (545 / 1228));
  await expect.poll(frame).not.toBe(original);
  await tool.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(frame).toBe(original);
  await tool.getByRole('button', { name: '다시 실행' }).click();
  await expect.poll(frame).not.toBe(original);

  await tool.getByRole('button', { name: '이동', exact: true }).click();
  const x = tool.locator('.of-controls input[type="range"]').first();
  const beforeX = await x.inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * (545 / 1228));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height * (545 / 1228) + 10, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => x.inputValue()).not.toBe(beforeX);
  await tool.getByRole('button', { name: '카드에 적용' }).click();
  await expect(tool.getByRole('dialog', { name: '오버프레임 정밀 편집' })).toHaveCount(0);
  await expect(tool.getByRole('button', { name: /정밀 편집 · 마스크/ })).toBeVisible();
});
