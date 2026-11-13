import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=", "base64");

test("YGO V3.4: OCG풍 효과창 · 원본 폰트 · 종족/공수 · 저장 · 1500x2000 PNG", async ({ page }) => {
  await page.goto("/ygocardganri/");
  await page.getByRole("button", { name: "카드 렌더러", exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');

  // Use a real, valid WOFF2 test fixture from the already installed cardmaker dependency.
  // No synthetic or invalid fonts: only the local test resource pack is affected.
  const fontDir = ".integration_sources/cardmaker/node_modules/@fontsource-variable/noto-sans-kr/files";
  const fontName = (await readdir(fontDir)).filter(n => n.endsWith(".woff2")).sort()[0];
  if (!fontName) throw Error("실제 글꼴 WOFF2 테스트 파일이 없습니다.");
  const font = await readFile(join(fontDir,fontName));
  const zip = new JSZip();
  for (const path of [
    "card-effect.png","card-spell.png","card-trap.png",
    "attribute-wind-kr.png","attribute-dark-kr.png","attribute-light-kr.png",
    "attribute-earth-kr.png","attribute-water-kr.png","attribute-fire-kr.png",
    "attribute-divine-kr.png","attribute-spell-kr.png","attribute-trap-kr.png",
    "level.png","rank.png",
  ]) zip.file(path,PNG);
  for (const name of ["ygo-kr-name.woff2","ygo-kr-race.woff2","ygo-kr.woff2"])
    zip.file(name,font);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name:"OCG_원본에셋_시험.zip",mimeType:"application/zip",
    buffer:await zip.generateAsync({type:"nodebuffer"}),
  });
  await expect(tool.getByText(/OCG_원본에셋_시험.zip/)).toBeVisible();

  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  const dialog = tool.getByRole("dialog",{name:"오버프레임 간편 제작"});
  const style = dialog.getByRole("combobox",{name:"간편 모드 효과창 스타일"});
  await expect(style).toHaveValue("ocg");

  const artwork = await page.evaluate(() => {
    const c=document.createElement("canvas");
    c.width=90;c.height=120;
    const ctx=c.getContext("2d")!;
    ctx.fillStyle="#38475a";
    ctx.fillRect(0,0,90,120);
    return c.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name:"오버프레임_효과창검증.png",mimeType:"image/png",
    buffer:Buffer.from(artwork,"base64"),
  });
  const canvas = dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).width)).toBe(900);
  const pixels = () => canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL("image/png"));
  const before=await pixels();

  await dialog.getByRole("combobox",{name:"효과창 테두리 색감"}).selectOption("violet");
  await expect.poll(pixels).not.toBe(before);
  const tinted=await pixels();
  await dialog.getByRole("combobox",{name:"효과창 테두리 구성"}).selectOption("none");
  await expect.poll(pixels).not.toBe(tinted);
  await dialog.getByRole("combobox",{name:"효과창 테두리 구성"}).selectOption("double");
  await dialog.getByRole("spinbutton",{name:"효과창 질감 강도"}).fill("60");
  await dialog.getByRole("spinbutton",{name:"효과창 테두리 굵기"}).fill("3");

  await dialog.getByRole("combobox",{name:"간편 모드 카드 종류"}).selectOption("xyz");
  await dialog.getByRole("checkbox",{name:"종족·소환 방식 표기"}).check();
  await dialog.getByRole("combobox",{name:"간편 모드 종족"}).selectOption("드래곤족");
  await dialog.getByRole("checkbox",{name:/공격력·수비력 표시/}).check();
  await dialog.getByRole("textbox",{name:"간편 모드 공격력"}).fill("3500");
  await dialog.getByRole("textbox",{name:"간편 모드 수비력"}).fill("3000");
  await dialog.getByRole("checkbox",{name:"효과창에 텍스트 표시"}).check();
  await expect.poll(pixels).not.toBe(tinted);
  await expect(dialog.getByText(/원본 에셋 필요/)).toHaveCount(0);

  await dialog.getByRole("button",{name:"설정 저장"}).click();
  await expect(dialog).toHaveCount(0);
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  await expect(dialog.getByRole("combobox",{name:"효과창 테두리 색감"})).toHaveValue("violet");
  await expect(dialog.getByRole("combobox",{name:"효과창 테두리 구성"})).toHaveValue("double");
  await expect(dialog.getByRole("spinbutton",{name:"효과창 질감 강도"})).toHaveValue("60");
  await expect(dialog.getByRole("checkbox",{name:/공격력·수비력 표시/})).toBeChecked();
  await expect(dialog.getByRole("textbox",{name:"간편 모드 공격력"})).toHaveValue("3500");
  await expect(dialog.getByRole("textbox",{name:"간편 모드 수비력"})).toHaveValue("3000");

  const downloadPromise=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"3:4 PNG 다운로드"}).click();
  const file=await downloadPromise;
  const result=await readFile(await file.path());
  expect(file.suggestedFilename()).toMatch(/^\d+\.png$/);
  expect(result.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(result.readUInt32BE(16)).toBe(1500);
  expect(result.readUInt32BE(20)).toBe(2000);
});
