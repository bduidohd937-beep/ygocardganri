import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

test('V2.4: 로컬 JSON+프레임 ZIP을 통합 렌더러에 명시적으로 전달',async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await page.goto('/ygocardganri/');
  await page.getByRole('button',{name:'카드 렌더러',exact:true}).click();
  const maker=page.locator('[data-native-tool="cardmaker"]');
  await expect.poll(()=>maker.evaluate(el=>el.shadowRoot?.querySelectorAll('select option[value="token"]').length??0),{timeout:30000}).toBe(1);
  await page.getByRole('button',{name:'로컬 카드와 프레임 에셋 옮기기'}).click();
  await expect(page.getByRole('dialog',{name:'로컬 DUELMIND 자료 이전'})).toBeVisible();
  await expect(page.getByText('서로 다른 브라우저 저장소를 사용합니다.',{exact:false})).toBeVisible();

  const card={id:918760112,name:'A7－00 통합 검수 카드',theme:'이클립스',frame:'xyz',
    attribute:'어둠',race:'사이버스족',level:5,atk:'2500',def:'2200',effect:'테스트 효과',artwork:''};
  await page.getByLabel('로컬 카드 프로젝트 JSON').setInputFiles({
    name:'로컬_메이커_백업.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,name:'로컬 카드',cards:[card]}))
  });
  await expect(page.getByRole('status').filter({hasText:'카드 JSON을 원본 렌더러의 가져오기 기능에 전달했습니다.'})).toBeVisible();
  await expect.poll(()=>maker.evaluate(el=>el.shadowRoot?.textContent?.includes('A7－00 통합 검수 카드')??false),{timeout:15000}).toBe(true);

  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/H2cAAAAASUVORK5CYII=','base64');
  const zip=new JSZip();
  for(const name of ['card-effect.png','card-spell.png','card-trap.png'])zip.file(name,image);
  await page.getByLabel('로컬 프레임 리소스 ZIP').setInputFiles({
    name:'로컬_프레임_검증.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})
  });
  await expect(page.getByRole('status').filter({hasText:'리소스 ZIP을 원본 렌더러에 전달했습니다.'})).toBeVisible();
  await expect.poll(()=>maker.evaluate(el=>el.shadowRoot?.textContent?.includes('로컬_프레임_검증.zip')??false),{timeout:15000}).toBe(true);
  await page.getByRole('button',{name:'자료 이전 닫기'}).click();
  await expect(page.getByRole('dialog',{name:'로컬 DUELMIND 자료 이전'})).toHaveCount(0);
});

test('V2.4: DESIGN LAB 및 PSH에 공통 스튜디오 스타일 적용 · 원본 도구 보존',async({page})=>{
  await page.goto('/ygocardganri/');
  for(const [name,tool] of [['디자인·덱 실험실','designlab'],['PSH 검증 관제실','arena']] as const){
    await page.getByRole('button',{name,exact:true}).click();
    const frame=page.locator(`iframe[src="/ygocardganri/modules/${tool}/"]`);
    await expect(frame).toBeVisible();
    const document=page.frameLocator(`iframe[src="/ygocardganri/modules/${tool}/"]`);
    await expect(document.locator('#ygo-studio-theme-v2-4')).toHaveCount(1,{timeout:20000});
    await expect(document.locator('body')).not.toBeEmpty();
    await page.getByRole('button',{name:'스튜디오로 돌아가기'}).click();
  }
});
