import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=",
  "base64",
);

test("YGO V3.6: 카드 ID 원화 2장 자동매칭 → 누락 보고 → 3:4/EDOPro ZIP → 프로젝트 저장", async ({page})=>{
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');

  // Supply a valid font and genuine asset layout for the native compositing pipeline.
  const path=".integration_sources/cardmaker/node_modules/@fontsource-variable/noto-sans-kr/files";
  const name=(await readdir(path)).filter(s=>s.endsWith(".woff2")).sort()[0];
  if(!name)throw Error("테스트용 WOFF2 폰트가 없습니다.");
  const resourceZip=new JSZip();
  for(const asset of [
    "card-effect.png","card-spell.png","card-trap.png",
    "attribute-dark-kr.png","attribute-light-kr.png","attribute-earth-kr.png",
    "attribute-water-kr.png","attribute-fire-kr.png","attribute-wind-kr.png",
    "attribute-divine-kr.png","attribute-spell-kr.png","attribute-trap-kr.png",
    "level.png","rank.png",
  ])resourceZip.file(asset,TINY_PNG);
  const font=await readFile(join(path,name));
  for(const file of ["ygo-kr-name.woff2","ygo-kr.woff2","ygo-kr-race.woff2"])
    resourceZip.file(file,font);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name:"원본카드_검증에셋.zip",mimeType:"application/zip",
    buffer:await resourceZip.generateAsync({type:"nodebuffer"}),
  });
  await expect(tool.getByText(/원본카드_검증에셋.zip/)).toBeVisible();

  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:/여러 장 일괄 제작/}).click();
  const dialog=tool.getByRole("dialog",{name:"오버프레임 일괄 제작·ZIP 출력"});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/선택 3장/)).toBeVisible();
  const artFiles=await page.evaluate(()=>{
    return ["#405869","#8373a0"].map(color=>{
      const canvas=document.createElement("canvas");
      canvas.width=90;canvas.height=120;
      const ctx=canvas.getContext("2d")!;
      ctx.fillStyle=color;
      ctx.fillRect(0,0,90,120);
      return canvas.toDataURL("image/png").split(",")[1];
    });
  });
  const artworkZip=new JSZip();
  artworkZip.file("210000401.png",Buffer.from(artFiles[0],"base64"));
  artworkZip.file("오션테일_원화/210000402_이미지.png",Buffer.from(artFiles[1],"base64"));
  artworkZip.file("999999999.png",Buffer.from(artFiles[0],"base64"));
  await dialog.locator('input[aria-label="오버프레임 일괄 원화 파일"]').setInputFiles({
    name:"오버프레임_원화_묶음.zip",mimeType:"application/zip",
    buffer:await artworkZip.generateAsync({type:"nodebuffer"}),
  });
  await expect(dialog.getByText(/2장 자동 매칭/)).toBeVisible();
  await expect(dialog.getByText(/출력 가능 2장/)).toBeVisible();
  await expect(dialog.getByText(/누락\/오류 1장/)).toBeVisible();
  await expect(dialog.getByAltText("이소바르 아르젠 오버프레임 미리보기")).toBeVisible();
  await expect(dialog.getByAltText("이소바르 솔라 호크 오버프레임 미리보기")).toBeVisible();

  const download=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"오버프레임 ZIP 다운로드"}).click();
  const result=await download;
  expect(result.suggestedFilename()).toBe("오버프레임_일괄제작.zip");
  const archive=await JSZip.loadAsync(await readFile(await result.path()));
  const expected=[
    "고화질_3대4/210000401.png","고화질_3대4/210000402.png",
    "pics/210000401.png","pics/210000402.png",
    "제작내역.json","누락_및_오류.txt",
  ];
  for(const path of expected)expect(archive.file(path)).not.toBeNull();
  expect(archive.file("pics/210000403.png")).toBeNull();
  const full=await archive.file("고화질_3대4/210000401.png")!.async("nodebuffer");
  const edo=await archive.file("pics/210000401.png")!.async("nodebuffer");
  expect([full.readUInt32BE(16),full.readUInt32BE(20)]).toEqual([1500,2000]);
  expect([edo.readUInt32BE(16),edo.readUInt32BE(20)]).toEqual([421,614]);
  const manifest=JSON.parse(await archive.file("제작내역.json")!.async("string"));
  expect(manifest.successful).toBe(2);
  expect(manifest.skipped).toEqual(expect.arrayContaining([expect.objectContaining({id:210000403})]));
  const warning=await archive.file("누락_및_오류.txt")!.async("string");
  expect(warning).toContain("210000403");
  await expect(dialog.getByText(/ZIP 완료: 2장/)).toBeVisible();

  // Explicit apply persists new artwork; by default ZIP generation never mutates card storage.
  await dialog.getByRole("button",{name:/선택 카드에 원화·설정 저장/}).click();
  await expect(dialog.getByText(/2장의 원화·설정을 프로젝트에 저장/)).toBeVisible();
  await dialog.getByRole("button",{name:"닫기",exact:true}).click();
  await tool.getByRole("button",{name:/여러 장 일괄 제작/}).click();
  await expect(dialog.getByText(/출력 가능 2장/)).toBeVisible();
});

test("YGO V3.6: EDOPro만 출력하면서 여백 추가, 원화 비율 왜곡 방지",async({page})=>{
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:/여러 장 일괄 제작/}).click();
  const dialog=tool.getByRole("dialog",{name:"오버프레임 일괄 제작·ZIP 출력"});
  const art=await page.evaluate(()=>{
    const canvas=document.createElement("canvas");
    canvas.width=90;canvas.height=120;
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle="#123456";ctx.fillRect(0,0,90,120);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.locator('input[aria-label="오버프레임 일괄 원화 파일"]').setInputFiles({
    name:"210000401.png",mimeType:"image/png",buffer:Buffer.from(art,"base64"),
  });
  // Use artwork-only preview to isolate aspect fit from native card assets.
  // Rendering a card requires user-provided fonts/icons; validate EDOPro fit in pure tests instead.
  await expect(dialog.getByText(/1장 자동 매칭/)).toBeVisible();
  await dialog.getByRole("combobox",{name:"일괄 출력 규격"}).selectOption("edopro");
  await dialog.getByRole("combobox",{name:"EDOPro 비율 방식"}).selectOption("pad");
  await expect(dialog.getByRole("combobox",{name:"EDOPro 비율 방식"})).toHaveValue("pad");
  await expect(dialog.getByText(/출력 가능 0장/)).toBeVisible();
  await expect(dialog.getByText(/원본 카드 에셋 누락/).first()).toBeVisible();
});
