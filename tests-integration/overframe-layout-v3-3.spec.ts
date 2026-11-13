import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=", "base64");

test("3:4 V3.3: 자유 드래그·크기조절·스냅·프리셋·저장·PNG 출력", async ({ page }) => {
  await page.goto("/ygocardganri/");
  await page.getByRole("button", { name: "카드 렌더러", exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');

  const zip = new JSZip();
  for (const path of [
    "card-effect.png", "card-spell.png", "card-trap.png",
    "attribute-wind-kr.png", "attribute-dark-kr.png", "attribute-light-kr.png",
    "attribute-earth-kr.png", "attribute-water-kr.png", "attribute-fire-kr.png",
    "attribute-divine-kr.png", "attribute-spell-kr.png", "attribute-trap-kr.png",
    "level.png", "rank.png",
  ]) zip.file(path, PNG);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name: "카드에셋_시험.zip", mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(tool.getByText(/카드에셋_시험.zip/)).toBeVisible();
  await tool.getByRole("tab", { name: "오버프레임", exact: true }).click();
  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  const dialog = tool.getByRole("dialog", { name: "오버프레임 간편 제작" });
  await dialog.getByRole("checkbox", { name: "카드명 표시" }).uncheck();

  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 90; c.height = 120;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#10233a";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#d1a8d8";
    ctx.fillRect(10, 20, 70, 65);
    return c.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name: "오버프레임_원화.png", mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  const canvas = dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBe(900);
  const snapshot = () => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL("image/png"));
  const initial = await snapshot();

  const effect = dialog.getByRole("button", { name: "효과창 이동" });
  await expect(effect).toBeVisible();
  await dialog.getByRole("checkbox", { name: /가운데·안전 여백/ }).uncheck();
  const box = await effect.boundingBox();
  if (!box) throw Error("효과창 직접 배치 핸들이 표시되지 않았습니다.");
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5 + 35, box.y + box.height * .4 - 20, { steps: 6 });
  await page.mouse.up();
  const x = dialog.getByRole("spinbutton", { name: "효과창 X" });
  await expect.poll(() => x.inputValue()).not.toBe("36");
  await expect.poll(snapshot).not.toBe(initial);
  const positionedX = await x.inputValue();

  const width = dialog.getByRole("spinbutton", { name: "효과창 W" });
  const startWidth = await width.inputValue();
  const handle = dialog.locator(".simple-of-target.active .simple-of-resize");
  const resizeBox = await handle.boundingBox();
  if (!resizeBox) throw Error("효과창 크기 조절 핸들이 표시되지 않았습니다.");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 - 38, resizeBox.y + resizeBox.height / 2 - 12, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => width.inputValue()).not.toBe(startWidth);

  await dialog.getByRole("textbox", { name: "프리셋 이름" }).fill("전투형");
  await dialog.getByRole("button", { name: "현재 배치 프리셋 저장" }).click();
  await expect(dialog.getByRole("combobox", { name: "오버프레임 프리셋 불러오기" })
    .locator('option[value="save:전투형"]')).toHaveCount(1);
  await x.fill("200");
  await expect(x).toHaveValue("200");
  await dialog.getByRole("combobox", { name: "오버프레임 프리셋 불러오기" })
    .selectOption("save:전투형");
  await expect.poll(() => x.inputValue()).toBe(positionedX);

  await dialog.getByRole("button", { name: "설정 저장" }).click();
  await expect(dialog).toHaveCount(0);
  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  await expect(x).toHaveValue(positionedX);
  await expect(dialog.getByRole("combobox", { name: "오버프레임 프리셋 불러오기" })
    .locator('option[value="save:전투형"]')).toHaveCount(1);

  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "3:4 PNG 다운로드" }).click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toMatch(/^\d+\.png$/);
  const png = await readFile(await saved.path());
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1500);
  expect(png.readUInt32BE(20)).toBe(2000);
});
