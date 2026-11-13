import { test,expect } from "@playwright/test";
import JSZip from "jszip";
import {readFile,readdir} from "node:fs/promises";
import {join} from "node:path";

const PNG=Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=",
 "base64",
);
async function artBytes(page:import("@playwright/test").Page,color:string){
  const b64=await page.evaluate(color=>{
    const c=document.createElement("canvas");
    c.width=90;c.height=120;const ctx=c.getContext("2d")!;
    ctx.fillStyle=color;ctx.fillRect(0,0,90,120);
    return c.toDataURL("image/png").split(",")[1];
  },color);
  return Buffer.from(b64,"base64");
}
async function openHub(page:import("@playwright/test").Page){
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("button",{name:"V4.0 통합 작업실 열기"}).click();
  const hub=tool.getByRole("dialog",{name:"카드 제작 통합 작업실"});
  await expect(hub).toBeVisible();
  return {tool,hub};
}
async function loadAssets(hub:import("@playwright/test").Locator){
  const dir=".integration_sources/cardmaker/node_modules/@fontsource-variable/noto-sans-kr/files";
  const fontName=(await readdir(dir)).filter(x=>x.endsWith(".woff2")).sort()[0];
  if(!fontName)throw Error("테스트용 WOFF2 원본 글꼴 없음");
  const assetZip=new JSZip();
  for(const name of [
    "card-effect.png","card-spell.png","card-trap.png","card-mask.png",
    "attribute-wind-kr.png","attribute-dark-kr.png","attribute-light-kr.png",
    "attribute-earth-kr.png","attribute-water-kr.png","attribute-fire-kr.png",
    "attribute-divine-kr.png","attribute-spell-kr.png","attribute-trap-kr.png",
    "level.png","rank.png",
  ])assetZip.file(name,PNG);
  const font=await readFile(join(dir,fontName));
  for(const name of ["ygo-kr-name.woff2","ygo-kr-race.woff2","ygo-kr.woff2"])
    assetZip.file(name,font);
  await hub.locator('input[aria-label="통합 카드 에셋 ZIP"]').setInputFiles({
    name:"V40_원본카드_검증.zip",mimeType:"application/zip",
    buffer:await assetZip.generateAsync({type:"nodebuffer"}),
  });
  await expect(hub.getByText(/V40_원본카드_검증.zip/)).toBeVisible();
}
async function loadArt(page:import("@playwright/test").Page,hub:import("@playwright/test").Locator,ids:number[]){
  await hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/02 이미지/}).click();
  await hub.getByRole("radio",{name:"3:4 오버프레임 원화"}).check();
  const images=new JSZip();
  for(let i=0;i<ids.length;i++){
    images.file("원화/"+ids[i]+"_오버프레임.png",await artBytes(page,i?"#8472a4":"#3a5872"));
  }
  images.file("999999999.png",await artBytes(page,"#333333"));
  await hub.locator('input[aria-label="통합 이미지 묶음 파일"]').setInputFiles({
    name:"오버프레임_원화_원본.zip",mimeType:"application/zip",
    buffer:await images.generateAsync({type:"nodebuffer"}),
  });
  await expect(hub.locator(".studio-hub-image-report"))
    .toContainText("매칭 "+ids.length+"장");
  await expect(hub.locator(".studio-hub-image-report"))
    .toContainText("적용 예정 "+ids.length+"장");
  await hub.getByRole("button",{name:new RegExp("선택한 카드 "+ids.length+"장에 이미지 적용")}).click();
  await expect(hub.getByRole("status").last()).toContainText(ids.length+"장의 3:4 오버프레임 원화");
}

test("V4.0 CDB/에셋 통합·ID 원화 매칭·기존 이미지 보호·디자인 진입",async({page})=>{
  const {tool,hub}=await openHub(page);
  await expect(hub.getByText("01 카드·CDB")).toBeVisible();
  await expect(hub.locator(".studio-hub-stats")).toContainText("전체 카드");
  await loadAssets(hub);
  await loadArt(page,hub,[210000401,210000402]);
  await expect(hub.locator(".studio-hub-stats")).toContainText("두 형태 보유");
  await expect(hub.locator(".studio-hub-stats")).toContainText("2");
  // A new normal image must NOT replace existing demo art without opting in.
  await hub.getByRole("radio",{name:"일반 카드 일러스트"}).check();
  await hub.locator('input[aria-label="통합 이미지 묶음 파일"]').setInputFiles({
    name:"210000401.png",mimeType:"image/png",buffer:await artBytes(page,"#ff00a0"),
  });
  await expect(hub.locator(".studio-hub-image-report")).toContainText("적용 예정 0장");
  await expect(hub.locator(".studio-hub-image-report")).toContainText("기존 이미지 보호 1장");
  await hub.getByRole("checkbox",{name:/기존에 연결된 해당 종류의 이미지도 덮어쓰기/}).check();
  await expect(hub.locator(".studio-hub-image-report")).toContainText("적용 예정 1장");
  await hub.getByRole("button",{name:/선택한 카드 1장에 이미지 적용/}).click();
  await expect(hub.locator(".studio-hub-stats")).toContainText("두 형태 보유");

  await hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/03 디자인/}).click();
  await hub.getByRole("button",{name:"일반·3:4 나란히 비교"}).click();
  await expect(hub).toHaveCount(0);
  const compare=tool.getByRole("dialog",{name:"일반 카드 ↔ 오버프레임 비교·전환"});
  await expect(compare.getByAltText("일반 OCG 카드 비교 미리보기")).toBeVisible();
  await expect(compare.getByAltText("3:4 오버프레임 비교 미리보기")).toBeVisible();
  await compare.getByRole("button",{name:"비교 화면 닫기"}).click();
  await tool.getByRole("button",{name:"V4.0 통합 작업실 열기"}).click();
  await expect(hub.locator(".studio-hub-stats")).toContainText("두 형태 보유");
});

test("V4.0 통합 ZIP: 고화질 일반/3:4, EDOPro 양쪽·단독, 검수보고서",async({page})=>{
  const {hub}=await openHub(page);
  await loadAssets(hub);
  await loadArt(page,hub,[210000401]);
  // Limit output to one ID for byte-accurate comparison without bulk zip overhead.
  await hub.getByRole("checkbox",{name:"210000402 통합 작업 선택"}).uncheck();
  await hub.getByRole("checkbox",{name:"210000403 통합 작업 선택"}).uncheck();
  await hub.getByRole("navigation",{name:"통합 제작 단계"})
    .getByRole("button",{name:/04 출력/}).click();
  await expect(hub.locator(".studio-hub-image-report")).toContainText("출력 가능 2건");
  const download=page.waitForEvent("download");
  await hub.getByRole("button",{name:"선택 카드 통합 ZIP 다운로드"}).click();
  const data=await JSZip.loadAsync(await readFile(await(await download).path()));
  for(const [path,w,h] of [
    ["고화질_일반/210000401.png",1263,1842],
    ["고화질_오버프레임/210000401.png",1500,2000],
  ] as const){
    const bytes=await data.file(path)!.async("nodebuffer");
    expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([w,h]);
  }
  const m=JSON.parse(await data.file("제작_검수보고서.json")!.async("string"));
  expect(m.schema_version).toBe(4);
  expect(m.success).toBe(2);
  expect(m.skipped).toEqual([]);
  await expect(hub.getByText(/이미지 2장 ZIP 다운로드/)).toBeVisible();
  await hub.getByRole("combobox",{name:"통합 출력 규격"}).selectOption("edopro");
  await hub.getByRole("combobox",{name:"통합 EDOPro 비율"}).selectOption("pad");
  const download2=page.waitForEvent("download");
  await hub.getByRole("button",{name:"선택 카드 통합 ZIP 다운로드"}).click();
  const data2=await JSZip.loadAsync(await readFile(await(download2).path()));
  for(const name of [
    "EDOPro_일반/pics/210000401.png",
    "EDOPro_오버프레임/pics/210000401.png",
  ]){
    const bytes=await data2.file(name)!.async("nodebuffer");
    expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([421,614]);
  }
  const m2=JSON.parse(await data2.file("제작_검수보고서.json")!.async("string"));
  expect(m2.output.fit).toBe("pad");
  await hub.getByRole("combobox",{name:"통합 출력 형태"}).selectOption("overframe");
  const download3=page.waitForEvent("download");
  await hub.getByRole("button",{name:"선택 카드 통합 ZIP 다운로드"}).click();
  const data3=await JSZip.loadAsync(await readFile(await(download3).path()));
  expect(data3.file("pics/210000401.png")).not.toBeNull();
  expect(data3.file("EDOPro_일반/pics/210000401.png")).toBeNull();
});

test("V4.0 허브에서 JSON 백업을 내려받고 원본 카드 데이터 유지",async({page})=>{
  const {hub}=await openHub(page);
  const backup=page.waitForEvent("download");
  await hub.getByRole("button",{name:"프로젝트 JSON 백업"}).click();
  const file=await backup;
  expect(file.suggestedFilename()).toBe("YGO_STUDIO_프로젝트_백업.json");
  const json=JSON.parse(await readFile(await file.path(),"utf-8"));
  expect(json.version).toBe(1);
  expect(json.cards).toHaveLength(3);
  expect(json.cards[0].id).toBe(210000401);
  await hub.getByRole("button",{name:"통합 작업실 닫기"}).click();
  await expect(hub).toHaveCount(0);
});
