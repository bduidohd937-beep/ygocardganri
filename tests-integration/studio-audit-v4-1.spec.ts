import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

async function openHub(page:import("@playwright/test").Page){
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("button",{name:"V4.0 통합 작업실 열기"}).click();
  const hub=tool.getByRole("dialog",{name:"카드 제작 통합 작업실"});
  await expect(hub).toBeVisible();
  return {hub,tool};
}
async function makeArtwork(page:import("@playwright/test").Page){
  const b64=await page.evaluate(()=>{
    const c=document.createElement("canvas");
    c.width=90;c.height=120;
    const ctx=c.getContext("2d")!;
    ctx.fillStyle="#4c728e";ctx.fillRect(0,0,90,120);
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64,"base64");
}

test("V4.1: CDB·JSON 및 자산 ZIP 오류는 성공으로 표시하지 않고, 가져온 카드 자동 선택",async({page})=>{
  const {hub}=await openHub(page);
  await hub.locator('input[aria-label="통합 카드 데이터 파일"]').setInputFiles({
    name:"오류_카드.json",mimeType:"application/json",buffer:Buffer.from("{잘못된 JSON","utf8"),
  });
  await expect(hub.getByRole("alert")).toBeVisible();
  await expect(hub.getByRole("status")).toHaveCount(0);

  await hub.locator('input[aria-label="통합 카드 에셋 ZIP"]').setInputFiles({
    name:"깨진_에셋.zip",mimeType:"application/zip",buffer:Buffer.from("not-a-valid-zip","utf8"),
  });
  await expect(hub.getByRole("alert")).toBeVisible();
  await expect(hub.getByText(/종을 불러왔습니다/)).toHaveCount(0);

  const download=page.waitForEvent("download");
  await hub.getByRole("button",{name:"프로젝트 JSON 백업"}).click();
  const file=await download;
  const existing=JSON.parse(await readFile(await file.path(),"utf8"));
  const incoming=existing.cards.slice(0,2).map((card:Record<string,unknown>,i:number)=>({
    ...card,id:918765001+i,name:"V4.1 신규 검증 카드 "+(i+1),
  }));
  await hub.locator('input[aria-label="통합 카드 데이터 파일"]').setInputFiles({
    name:"신규카드_2종.json",mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify(incoming),"utf8"),
  });
  await expect(hub.getByRole("status")).toContainText("2장의 카드 데이터를 가져왔습니다.");
  await expect(hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/02 이미지/})).toHaveAttribute("aria-current","step");
  for(const id of [918765001,918765002]){
    await expect(hub.getByRole("checkbox",{name:id+" 통합 작업 선택"})).toBeChecked();
  }
  await expect(hub.getByRole("checkbox",{name:"210000401 통합 작업 선택"})).not.toBeChecked();
  await expect(hub.locator(".studio-hub-stats")).toContainText("작업 선택");
});

test("V4.1: 출력 전 카드별 누락 검수, 수정 이동, 검수표 JSON 및 미완성 카드 선택",async({page})=>{
  const {hub}=await openHub(page);
  await hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/04 출력/}).click();
  const audit=hub.getByRole("region",{name:"V4.1 출력 전 자동 검수"});
  await expect(audit).toBeVisible();
  await expect(audit).toContainText("보완 필요 3장");
  await expect(audit.getByText(/3:4 오버프레임 원화를 먼저 저장하세요/).first()).toBeVisible();
  await expect(hub.locator(".studio-hub-image-report")).toContainText("출력 가능 3건");
  await expect(hub.locator(".studio-hub-image-report")).toContainText("누락 예상 3건");

  const download=page.waitForEvent("download");
  await audit.getByRole("button",{name:"검수표 JSON 다운로드"}).click();
  const file=await download;
  expect(file.suggestedFilename()).toBe("YGO_STUDIO_출력전_검수표.json");
  const report=JSON.parse(await readFile(await file.path(),"utf8"));
  expect(report.version).toBe("4.1");
  expect(report.mode).toBe("both");
  expect(report.selected).toBe(3);
  expect(report.outputsReady).toBe(3);
  expect(report.outputsMissing).toBe(3);
  expect(report.cards).toHaveLength(3);

  await hub.getByRole("combobox",{name:"통합 출력 형태"}).selectOption("overframe");
  await expect(audit).toContainText("보완 필요 3장");
  await expect(audit.getByRole("button",{name:/출력 가능 카드만 선택/})).toBeDisabled();
  await audit.getByRole("button",{name:"210000401 오버프레임 문제 수정"}).click();
  await expect(hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/02 이미지/})).toHaveAttribute("aria-current","step");
  await expect(hub.getByRole("radio",{name:"3:4 오버프레임 원화"})).toBeChecked();
  await hub.locator('input[aria-label="통합 이미지 묶음 파일"]').setInputFiles({
    name:"210000401.png",mimeType:"image/png",buffer:await makeArtwork(page),
  });
  await expect(hub.locator(".studio-hub-image-report")).toContainText("적용 예정 1장");
  await hub.getByRole("button",{name:/선택한 카드 1장에 이미지 적용/}).click();
  await expect(hub.getByRole("status").last()).toContainText("1장의 3:4 오버프레임 원화");

  await hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/04 출력/}).click();
  await hub.getByRole("combobox",{name:"통합 출력 형태"}).selectOption("both");
  await expect(audit).toContainText("완전 준비 1장");
  await expect(audit).toContainText("보완 필요 2장");
  await audit.getByRole("button",{name:"미완성 카드만 선택 (2)"}).click();
  await expect(hub.getByRole("checkbox",{name:"210000401 통합 작업 선택"})).not.toBeChecked();
  await expect(hub.getByRole("checkbox",{name:"210000402 통합 작업 선택"})).toBeChecked();
  await expect(hub.getByRole("checkbox",{name:"210000403 통합 작업 선택"})).toBeChecked();
  await expect(hub.locator(".studio-hub-image-report")).toContainText("선택 2장");
  await audit.getByRole("button",{name:"출력 가능 카드만 선택 (2)"}).click();
  await expect(hub.locator(".studio-hub-image-report")).toContainText("출력 가능 2건");
});
