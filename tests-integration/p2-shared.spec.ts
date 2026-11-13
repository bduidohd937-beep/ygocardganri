import { test, expect } from '@playwright/test';
test('P2 공통 카드 등록·중복 충돌 방지·이미지 연구소 전달', async ({ page })=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
  await page.getByRole('textbox',{name:'숫자 카드 ID'}).fill('918760001');
  await page.getByRole('textbox',{name:'새 카드명'}).fill('RS－오리온');
  await page.getByRole('textbox',{name:'새 카드 테마'}).fill('아칠리쉬');
  await page.getByRole('button',{name:'직접 입력 검토'}).click();
  await expect(page.getByText('신규 카드').first()).toBeVisible();
  await page.getByRole('button',{name:'신규 자료만 확정'}).click();
  await expect(page.getByRole('cell',{name:'RS－오리온',exact:true})).toBeVisible();
  // Same ID with different source content remains a conflict, not an update.
  await page.locator('input[type="file"][accept=".json,.csv,.ydk"]').setInputFiles({
    name:'개정안.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({cards:[{id:918760001,name:'다른 이름',effect:'수정된 효과'}]}))
  });
  await expect(page.getByText('충돌(기존 유지)')).toBeVisible();
  await page.getByRole('button',{name:'신규 자료만 확정'}).click();
  await expect(page.getByRole('cell',{name:'RS－오리온',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'918760001 전송 선택'}).check();
  await page.getByRole('button',{name:'선택 카드 → 이미지 연구소'}).click();
  await expect(page.getByText('공통 보관함 선택 카드',{exact:false})).toBeVisible();
  const frame=page.locator('[data-native-tool="artlab"]');
  await expect(frame.locator('#art-canvas')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'선택 카드 신규만 가져오기'}).click();
  await expect(page.getByText('이미지 연구소에 신규 1장 추가를 요청했습니다.',{exact:false})).toBeVisible();
  await expect(frame.getByText('RS－오리온').first()).toBeVisible();
});
test('P2 카드 렌더러 전달은 신규 ID만 적용하며 YDK는 존별 보존',async ({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'공통 카드·덱 보관함'}).click();
  await page.getByRole('textbox',{name:'숫자 카드 ID'}).fill('918760002');
  await page.getByRole('textbox',{name:'새 카드명'}).fill('RS－세컨드 코너');
  await page.getByRole('button',{name:'직접 입력 검토'}).click();
  await page.getByRole('button',{name:'신규 자료만 확정'}).click();
  await page.locator('input[type="file"][accept=".json,.csv,.ydk"]').setInputFiles({
    name:'전개덱.ydk',mimeType:'text/plain',
    buffer:Buffer.from('#main\n918760002\n918760002\n#extra\n918760001\n!side\n918760003\n')
  });
  await page.getByRole('button',{name:'신규 자료만 확정'}).click();
  await expect(page.getByText('메인 2 / 엑스트라 1 / 사이드 1')).toBeVisible();
  await page.getByRole('checkbox',{name:'918760002 전송 선택'}).check();
  await page.getByRole('button',{name:'선택 카드 → 카드 렌더러'}).click();
  const maker=page.locator('[data-native-tool="cardmaker"]');
  await expect.poll(()=>maker.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0),{timeout:30000}).toBe(1);
  await page.getByRole('button',{name:'선택 카드 신규만 가져오기'}).click();
  await expect(page.getByText('렌더러에 신규 1장 가져오기를 요청했습니다.',{exact:false})).toBeVisible();
  await expect(maker.getByText('RS－세컨드 코너').first()).toBeVisible();
});
