import { expect,test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
const ids=Array.from({length:20},(_,i)=>String(91008601+i));
const deckText=['#created by P6 Chrome evidence test','#main',...ids.flatMap(x=>[x,x]),'#extra','!side',''].join('\n');

test('P6: imported YDK → saved study → manual EDOPro result and .yrpX evidence → reload without source mutation',async({page})=>{
  page.on('dialog',d=>void d.accept());
  await page.goto('/');
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'테마 라이브러리'}).click();
  await page.getByRole('button',{name:'새 테마'}).click();
  await page.getByPlaceholder('예: 코스모코드').fill('P6 EDOPro 실전 테스트');
  await page.getByRole('button',{name:'테마 등록'}).click();
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P6 EDOPro 실전 테스트'});
  await page.locator('.fc-drop input[type=file]').setInputFiles([
    {name:'P6_실험덱.ydk',mimeType:'text/plain',buffer:Buffer.from(deckText)},
  ]);
  await expect(page.locator('.fc-preview')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:/원본 보관 확정/}).click();
  await expect(page.locator('.fc-file-row')).toHaveCount(1);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByRole('button',{name:'원본에서 새 분석안'}).click();
  const panel=page.getByLabel('EDOPro 실전 검증 기록');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button',{name:'테스트 기록 저장'})).toBeDisabled();

  await page.getByLabel('새 루트 A 카드').selectOption(ids[0]);
  await page.getByRole('button',{name:'루트 추가'}).click();
  // P6 must not duplicate the existing P5 research panel during React re-renders.
  await expect(page.locator('.combo-shell')).toHaveCount(1);
  await expect(page.locator('.testlab')).toHaveCount(1);
  await page.getByRole('button',{name:'분석안 저장'}).click();
  await expect(page.locator('.combo-shell')).toHaveCount(1);
  await expect(page.locator('.testlab')).toHaveCount(1);
  await expect(page.locator('.decklab-save-state')).toContainText('저장된 분석안');
  await expect(panel.getByRole('button',{name:'테스트 기록 저장'})).toBeEnabled();

  await panel.getByLabel('EDOPro 첫 패 카드 ID').fill(ids.slice(0,5).join(', '));
  await panel.getByLabel('EDOPro 추출 방식').selectOption('무작위 셔플(사용자 기록)');
  await panel.getByLabel('EDOPro 결과').selectOption('전개 성공(사용자 판정)');
  await panel.getByLabel('EDOPro 실험 메모').fill('테스트 픽스처: 사용자가 실제 결과라고 보고한 기록 시나리오');
  const replayBytes=Buffer.from('YRPX_TEST_FIXTURE_NOT_A_REAL_EDOPRO_REPLAY\x00\x01\x02');
  await panel.getByLabel('EDOPro 리플레이 파일').setInputFiles([
    {name:'_LastReplay.yrpX',mimeType:'application/octet-stream',buffer:replayBytes},
  ]);
  await panel.getByRole('button',{name:'테스트 기록 저장'}).click();
  await expect(panel.getByText('사용자 판정과 리플레이 해시를 저장했어.',{exact:false})).toBeVisible();
  await expect(panel.locator('.testlab-entry')).toHaveCount(1);
  const digest=createHash('sha256').update(replayBytes).digest('hex');
  await expect(panel.locator('.testlab-hash')).toContainText(digest.slice(0,16));
  await expect(panel.locator('.testlab-stats>div').nth(2)).toContainText('1건');
  await expect(panel.locator('.testlab-stats>div').nth(1)).toContainText('100.0%');

  // An intentionally constructed Test Hand is excluded from random-sample statistics.
  await panel.getByLabel('EDOPro 첫 패 카드 ID').fill(ids.slice(5,10).join(','));
  await panel.getByLabel('EDOPro 추출 방식').selectOption('의도적으로 구성한 패');
  await panel.getByLabel('EDOPro 결과').selectOption('전개 실패(사용자 판정)');
  await panel.getByRole('button',{name:'테스트 기록 저장'}).click();
  await expect(panel.locator('.testlab-entry')).toHaveCount(2);
  await expect(panel.locator('.testlab-stats>div').nth(2)).toContainText('1건');

  await page.reload();
  await expect(page.locator('.realm-tile')).toHaveCount(5);
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByLabel('저장된 분석안').selectOption({index:1});
  const restored=page.getByLabel('EDOPro 실전 검증 기록');
  await expect(restored.locator('.testlab-entry')).toHaveCount(2);
  await expect(restored.locator('.testlab-stats>div').nth(2)).toContainText('1건');
  await expect(restored.locator('.testlab-stats>div').nth(1)).toContainText('100.0%');
  const replayDownload=page.waitForEvent('download');
  await restored.getByRole('button',{name:'리플레이 받기'}).click();
  const downloaded=await replayDownload;
  expect(downloaded.suggestedFilename()).toBe('_LastReplay.yrpX');
  expect(await readFile((await downloaded.path())!)).toEqual(replayBytes);

  const backupDownload=page.waitForEvent('download');
  await restored.getByRole('button',{name:'기록 JSON 백업'}).click();
  const backup=await backupDownload;
  const records=JSON.parse(await readFile((await backup.path())!,'utf8'));
  expect(records.records).toHaveLength(2);
  expect(records.records.some((r:{replay?:{sha256:string}})=>r.replay?.sha256===digest)).toBe(true);
  expect(JSON.stringify(records)).not.toContain('YRPX_TEST_FIXTURE');
  // P6.0.1: a metadata backup can be restored without replacing the P5 study or original YDK.
  await restored.getByRole('button',{name:'기록 삭제'}).first().click();
  await restored.getByRole('button',{name:'기록 삭제'}).first().click();
  await expect(restored.locator('.testlab-entry')).toHaveCount(0);
  await restored.getByLabel('EDOPro 테스트 기록 JSON 가져오기').setInputFiles((await backup.path())!);
  await expect(restored.locator('.testlab-entry')).toHaveCount(2);
  await expect(restored.locator('.testlab-stats>div').nth(2)).toContainText('1건');
  await expect(restored.getByText('리플레이 바이너리는 복원되지 않았습니다.',{exact:false})).toBeVisible();

  // Restored descriptors are not mistaken for actual replay files.
  await restored.getByRole('button',{name:'리플레이 받기'}).click();
  await expect(restored.getByRole('alert')).toContainText('리플레이 원본을 찾지 못했습니다');

  // Re-import is idempotent and never clears existing evidence.
  await restored.getByLabel('EDOPro 테스트 기록 JSON 가져오기').setInputFiles((await backup.path())!);
  await expect(restored.getByText('기존과 동일 2건',{exact:false})).toBeVisible();
  await expect(restored.locator('.testlab-entry')).toHaveCount(2);
  // P6.1 imports external exports as unverified source evidence, never duel success telemetry.
  const intake=restored.getByLabel('PSH AI ARENA 결과 파일 수집함');
  const arenaJson=Buffer.from(JSON.stringify({sessions:[{id:'arena-fixture',state:'stalled'}],source:'fixture'}));
  await intake.getByLabel('PSH AI ARENA 내보내기 파일').setInputFiles([
    {name:'경기장_결과.json',mimeType:'application/json',buffer:arenaJson},
  ]);
  await expect(intake.getByText('원본 수집 완료.',{exact:false})).toBeVisible();
  await expect(intake.locator('.testlab-entry')).toHaveCount(1);
  await expect(intake.locator('.testlab-entry')).toContainText('sessions');
  await expect(intake.locator('.testlab-entry')).toContainText('내용 미검증');
  await expect(restored.locator('.testlab-stats>div').nth(2)).toContainText('1건');

  // Same content in the same deck version is deduplicated by SHA256.
  await intake.getByLabel('PSH AI ARENA 내보내기 파일').setInputFiles([
    {name:'같은파일.json',mimeType:'application/json',buffer:arenaJson},
  ]);
  await expect(intake.getByText('중복 저장하지 않았습니다.',{exact:false})).toBeVisible();
  await expect(intake.locator('.testlab-entry')).toHaveCount(1);
  const sourceDownload=page.waitForEvent('download');
  await intake.getByRole('button',{name:'원본 받기 (해시 확인)'}).click();
  expect(await readFile((await(await sourceDownload).path())!)).toEqual(arenaJson);

  const zip=new JSZip();
  zip.file('logs/session.json',JSON.stringify({status:'incomplete'}));
  zip.file('replays/_LastReplay.yrpX',Buffer.from('NOT_A_REAL_REPLAY'));
  const zipBytes=await zip.generateAsync({type:'nodebuffer'});
  await intake.getByLabel('PSH AI ARENA 내보내기 파일').setInputFiles([
    {name:'경기장_묶음.zip',mimeType:'application/zip',buffer:zipBytes},
  ]);
  await expect(intake.locator('.testlab-entry')).toHaveCount(2);
  await expect(intake.locator('.testlab-entry').first()).toContainText('ZIP 파일 목록');
  await expect(restored.locator('.testlab-stats>div').nth(2)).toContainText('1건');

  await page.reload();
  await page.locator('.sidebar .nav-link').filter({hasText:'덱 연구실'}).click();
  await page.getByLabel('저장된 분석안').selectOption({index:1});
  const persisted=page.getByLabel('PSH AI ARENA 결과 파일 수집함');
  await expect(persisted.locator('.testlab-entry')).toHaveCount(2);
  await page.locator('.sidebar .nav-link').filter({hasText:'파일 센터'}).click();
  await page.locator('.fc-file-select select').selectOption({label:'P6 EDOPro 실전 테스트'});
  await expect(page.locator('.fc-index-list')).toContainText('메인 40');
});
