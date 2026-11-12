import {test,expect} from '@playwright/test';

test('UI V2: YGO STUDIO 메인과 바로가기, 카테고리 접기 및 최근 작업',async ({page})=>{
  await page.goto('/ygocardganri/');
  await expect(page).toHaveTitle(/YGO STUDIO/);
  await expect(page.getByRole('heading',{name:'YGO STUDIO'})).toBeVisible();
  await expect(page.getByText('최근 작업',{exact:true})).toBeVisible();
  await expect(page.locator('.v2-shortcut')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'공통 카드·덱 보관함'}).first()).toBeVisible();
  const research=page.getByRole('button',{name:'연구 · 검증'});
  await research.click();
  await expect(research).toHaveAttribute('aria-expanded','false');
  await research.click();
  await expect(research).toHaveAttribute('aria-expanded','true');
  await page.locator('.sidebar .nav-link').filter({hasText:'이미지 연구소'}).click();
  await expect(page.locator('[data-fullscreen-workspace="artlab"]')).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  await expect(page.getByRole('heading',{name:'YGO STUDIO'})).toBeVisible();
  await expect(page.getByText('이미지 연구소',{exact:true}).last()).toBeVisible();
  await page.getByRole('button',{name:'메뉴 접기'}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar--compact/);
  await page.getByRole('button',{name:'메뉴 펼치기'}).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar--compact/);
});

test('UI V2: 실제 보관함 테마만 프로젝트 목록에 표시하고 공통 자료를 검색한다',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('ygo-studio-shared-catalog-v1',JSON.stringify({
      schemaVersion:1,
      cards:[{id:'918760001',name:'코스모코드－알파',theme:'코스모코드',effect:'',source:'기존 자료'},
        {id:'918760002',name:'무성해－아비온',theme:'무성해',effect:'',source:'기존 자료'}],
      decks:[]
    }));
  });
  await page.goto('/ygocardganri/');
  const picker=page.getByRole('combobox',{name:'현재 프로젝트 선택'});
  await expect(picker).toContainText('코스모코드');
  await expect(picker).not.toContainText('등록되지 않은 테마');
  await picker.selectOption('shared:코스모코드');
  await expect(page.getByRole('heading',{name:'코스모코드',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'공통 카드 목록 열기'}).click();
  await expect(page.getByRole('textbox',{name:'공통 카드 검색'})).toHaveValue('코스모코드');
  await expect(page.getByRole('cell',{name:'코스모코드－알파'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'무성해－아비온'})).toHaveCount(0);
});

test('UI V2: 좁은 화면에서 사이드바를 열고 작업실로 이동한다',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/ygocardganri/');
  await expect(page.getByRole('heading',{name:'YGO STUDIO'})).toBeVisible();
  await expect(page.locator('.v2-overview > div')).toHaveCount(4);
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/sidebar--open/);
  await page.locator('.sidebar .nav-link').filter({hasText:'카드 라이브러리'}).click();
  await expect(page.getByRole('heading',{name:'카드 라이브러리'})).toBeVisible();
});
