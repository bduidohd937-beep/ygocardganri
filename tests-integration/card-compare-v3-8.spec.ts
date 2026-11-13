import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=","base64",
);
test("V3.8: 일반 카드 ↔ 오버프레임 실물 비교·기본 미리보기 전환·고화질/EDOPro ZIP",async({page})=>{
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  const fonts=".integration_sources/cardmaker/node_modules/@fontsource-variable/noto-sans-kr/files";
  const fontName=(await readdir(fonts)).filter(s=>s.endsWith(".woff2")).sort()[0];
  if(!fontName)throw Error("테스트용 글꼴 WOFF2 파일 없음");
  const zip=new JSZip();
  for(const name of [
    "card-effect.png","card-spell.png","card-trap.png","card-mask.png",
    "attribute-wind-kr.png","attribute-dark-kr.png","attribute-light-kr.png",
    "attribute-earth-kr.png","attribute-water-kr.png","attribute-fire-kr.png",
    "attribute-divine-kr.png","attribute-spell-kr.png","attribute-trap-kr.png",
    "level.png","rank.png",
  ])zip.file(name,PNG);
  const font=await readFile(join(fonts,fontName));
  for(const name of ["ygo-kr-name.woff2","ygo-kr-race.woff2","ygo-kr.woff2"])
    zip.file(name,font);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name:"실물에셋_V38_검증.zip",mimeType:"application/zip",
    buffer:await zip.generateAsync({type:"nodebuffer"}),
  });
  await expect(tool.getByText(/실물에셋_V38_검증.zip/)).toBeVisible();
  const compareButton=tool.getByRole("button",{name:"일반 카드와 오버프레임 비교"});
  await compareButton.click();
  const dialog=tool.getByRole("dialog",{name:"일반 카드 ↔ 오버프레임 비교·전환"});
  await expect(dialog.getByAltText("일반 OCG 카드 비교 미리보기")).toBeVisible();
  await expect(dialog.getByText(/3:4 오버프레임 원화를 먼저 저장하세요/).first()).toBeVisible();
  await expect(dialog.getByRole("button",{name:"두 형태 비교 ZIP 다운로드"})).toBeDisabled();
  await dialog.getByRole("button",{name:"비교 화면 닫기"}).click();

  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  const simple=tool.getByRole("dialog",{name:"오버프레임 간편 제작"});
  const art=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=90;c.height=120;
    const ctx=c.getContext("2d")!;
    for(let i=0;i<120;i++){ctx.fillStyle=i<40?"#233f55":i<90?"#8c7a9f":"#22283d";ctx.fillRect(0,i,90,1);}
    return c.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name:"오버프레임_비교검증.png",mimeType:"image/png",buffer:Buffer.from(art,"base64"),
  });
  await expect.poll(()=>simple.locator('canvas[aria-label="3:4 오버프레임 미리보기"]')
    .evaluate(el=>(el as HTMLCanvasElement).width)).toBe(900);
  await simple.getByRole("button",{name:"설정 저장"}).click();
  await expect(simple).toHaveCount(0);

  await compareButton.click();
  await expect(dialog.getByAltText("일반 OCG 카드 비교 미리보기")).toBeVisible();
  await expect(dialog.getByAltText("3:4 오버프레임 비교 미리보기")).toBeVisible();
  const normalDimensions=await dialog.getByAltText("일반 OCG 카드 비교 미리보기")
    .evaluate(el=>[(el as HTMLImageElement).naturalWidth,(el as HTMLImageElement).naturalHeight]);
  const fullDimensions=await dialog.getByAltText("3:4 오버프레임 비교 미리보기")
    .evaluate(el=>[(el as HTMLImageElement).naturalWidth,(el as HTMLImageElement).naturalHeight]);
  expect(normalDimensions).toEqual([421,614]);
  expect(fullDimensions).toEqual([450,600]);

  await dialog.getByRole("button",{name:"3:4 오버프레임 미리보기 선택"}).click();
  await dialog.getByRole("button",{name:/선택한 형태를 기본 미리보기로 저장/}).click();
  await expect(dialog.getByText(/기본 미리보기를 '3:4 오버프레임'로 저장/)).toBeVisible();
  await dialog.getByRole("button",{name:"닫기",exact:true}).click();
  const mainCanvas=tool.locator(".card-object canvas");
  await expect.poll(()=>mainCanvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(900);
  await expect.poll(()=>mainCanvas.evaluate(el=>(el as HTMLCanvasElement).height)).toBe(1200);

  await tool.getByRole("button",{name:"일반 카드 미리보기로 전환"}).click();
  await expect.poll(()=>mainCanvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(842);
  await expect.poll(()=>mainCanvas.evaluate(el=>(el as HTMLCanvasElement).height)).toBe(1228);
  await tool.getByRole("button",{name:"오버프레임 미리보기로 전환"}).click();
  await expect.poll(()=>mainCanvas.evaluate(el=>(el as HTMLCanvasElement).width)).toBe(900);

  await compareButton.click();
  const chosen=dialog.getByRole("combobox",{name:"비교 출력할 형태"});
  const resolution=dialog.getByRole("combobox",{name:"비교 출력 해상도"});
  await chosen.selectOption("normal");
  const normalDownload=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"선택한 PNG 다운로드"}).click();
  const normalPng=await readFile(await (await normalDownload).path());
  expect([normalPng.readUInt32BE(16),normalPng.readUInt32BE(20)]).toEqual([1263,1842]);

  await chosen.selectOption("overframe");
  const fullDownload=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"선택한 PNG 다운로드"}).click();
  const fullPng=await readFile(await (await fullDownload).path());
  expect([fullPng.readUInt32BE(16),fullPng.readUInt32BE(20)]).toEqual([1500,2000]);

  await chosen.selectOption("both");
  const bothDownload=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"두 형태 비교 ZIP 다운로드"}).click();
  const bothZip=await JSZip.loadAsync(await readFile(await (await bothDownload).path()));
  const paths=Object.keys(bothZip.files);
  expect(paths).toContain("고화질/일반카드/210000401.png");
  expect(paths).toContain("고화질/오버프레임_3대4/210000401.png");
  expect(paths).toContain("비교_출력내역.json");
  const manifest=JSON.parse(await bothZip.file("비교_출력내역.json")!.async("string"));
  expect(manifest.outputs).toHaveLength(2);
  expect(manifest.outputs.map((x:{width:number;height:number})=>[x.width,x.height]))
    .toEqual([[1263,1842],[1500,2000]]);

  await resolution.selectOption("edopro");
  await dialog.getByRole("combobox",{name:"비교 EDOPro 비율 방식"}).selectOption("pad");
  const edoDownload=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"두 형태 비교 ZIP 다운로드"}).click();
  const edoZip=await JSZip.loadAsync(await readFile(await (await edoDownload).path()));
  for(const name of ["pics/210000401_일반.png","pics/210000401_오버프레임.png"]){
    const blob=await edoZip.file(name)!.async("nodebuffer");
    expect([blob.readUInt32BE(16),blob.readUInt32BE(20)]).toEqual([421,614]);
  }
});
