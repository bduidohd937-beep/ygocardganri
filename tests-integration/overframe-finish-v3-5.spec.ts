import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("V3.5 오버프레임: 연출 ON/OFF·종류별 광택·프리셋 저장·복원·PNG 출력", async ({ page }) => {
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  const dialog=tool.getByRole("dialog",{name:"오버프레임 간편 제작"});

  // Isolate the finish layer; the existing original-font and attribute tests
  // exercise text/asset compositing independently.
  await dialog.getByRole("checkbox",{name:"카드명 표시"}).uncheck();
  await dialog.getByRole("checkbox",{name:"속성 표시"}).uncheck();
  await dialog.getByRole("checkbox",{name:/레벨 아이콘 표시/}).uncheck();
  await dialog.getByRole("checkbox",{name:"효과창 표시"}).uncheck();

  const artwork=await page.evaluate(() => {
    const canvas=document.createElement("canvas");
    canvas.width=90;canvas.height=120;
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle="#32465a";
    ctx.fillRect(0,0,90,120);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name:"원화_3대4_검증.png",mimeType:"image/png",buffer:Buffer.from(artwork,"base64"),
  });
  const canvas=dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).width)).toBe(900);
  const snapshot=() => canvas.evaluate(c => (c as HTMLCanvasElement).toDataURL("image/png"));
  const original=await snapshot();
  const enabled=dialog.getByRole("checkbox",{name:"오버프레임 연출 사용"});
  const style=dialog.getByRole("combobox",{name:"오버프레임 연출 종류"});
  const strength=dialog.getByRole("slider",{name:"오버프레임 연출 강도"});
  const setStrength=(value:number)=>strength.evaluate((element,v)=>{
    const input=element as HTMLInputElement;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if (!setter) throw Error("슬라이더 setter를 찾지 못했습니다.");
    setter.call(input,String(v));
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
  },value);
  await expect(enabled).not.toBeChecked();
  await expect(style).toHaveValue("none");

  await style.selectOption("xyz");
  await expect(enabled).toBeChecked();
  await setStrength(80);
  await expect.poll(snapshot).not.toBe(original);
  const obsidian=await snapshot();
  await style.selectOption("fusion");
  await expect.poll(snapshot).not.toBe(obsidian);
  await enabled.uncheck();
  await expect.poll(snapshot).toBe(original);
  await enabled.check();
  await expect.poll(snapshot).not.toBe(original);

  // Custom presets are stored on the card, not in a transient browser-only setting.
  await dialog.getByRole("textbox",{name:"연출 프리셋 이름"}).fill("내 흑요광");
  await style.selectOption("xyz");
  await setStrength(70);
  await dialog.getByRole("button",{name:"현재 연출 프리셋 저장"}).click();
  const preset=dialog.getByRole("combobox",{name:"오버프레임 연출 프리셋"});
  await expect(preset.locator('option[value="user:내 흑요광"]')).toHaveCount(1);
  await dialog.getByRole("button",{name:/연출 초기화/}).click();
  await expect(enabled).not.toBeChecked();
  await expect(style).toHaveValue("none");
  await expect.poll(snapshot).toBe(original);
  await preset.selectOption("user:내 흑요광");
  await expect(style).toHaveValue("xyz");
  await expect(strength).toHaveValue("70");
  await expect(enabled).toBeChecked();
  await expect.poll(snapshot).not.toBe(original);

  await dialog.getByRole("button",{name:"설정 저장"}).click();
  await expect(dialog).toHaveCount(0);
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  await expect(enabled).toBeChecked();
  await expect(style).toHaveValue("xyz");
  await expect(strength).toHaveValue("70");
  await expect(preset.locator('option[value="user:내 흑요광"]')).toHaveCount(1);

  const download=page.waitForEvent("download");
  await dialog.getByRole("button",{name:"3:4 PNG 다운로드"}).click();
  const pngDownload=await download;
  const png=await readFile(await pngDownload.path());
  expect(pngDownload.suggestedFilename()).toMatch(/^\d+\.png$/);
  expect(png.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1500);
  expect(png.readUInt32BE(20)).toBe(2000);
  // Verify the 1500x2000 export contains the finish, not just the preview.
  const edgePixel=await page.evaluate(async b64 => {
    const img=new Image();
    img.src="data:image/png;base64,"+b64;
    await img.decode();
    const c=document.createElement("canvas");
    c.width=img.naturalWidth;c.height=img.naturalHeight;
    const ctx=c.getContext("2d")!;
    ctx.drawImage(img,0,0);
    return Array.from(ctx.getImageData(Math.round(17*1500/900),
      Math.round(17*2000/1200),1,1).data).slice(0,3);
  },png.toString("base64"));
  expect(edgePixel).not.toEqual([50,70,90]);
});
