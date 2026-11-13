import { test, expect } from "@playwright/test";

test("YGO STUDIO: 3:4 오버프레임 간편 제작·저장·PNG 다운로드", async ({ page }) => {
  await page.goto("/ygocardganri/");
  await page.getByRole("button", { name: "카드 렌더러", exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("tab", { name: "일러스트", exact: true }).click();
  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  const dialog = tool.getByRole("dialog", { name: "오버프레임 간편 제작" });
  await expect(dialog).toBeVisible();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 90;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#38165c";
    ctx.fillRect(0, 0, 90, 120);
    ctx.fillStyle = "#e88fdc";
    ctx.fillRect(10, 12, 50, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name: "오버프레임_3대4_원화.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const preview = dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  await expect.poll(() => preview.evaluate(c => (c as HTMLCanvasElement).width)).toBe(900);
  await expect.poll(() => preview.evaluate(c => (c as HTMLCanvasElement).height)).toBe(1200);
  const initial = await preview.evaluate(c => (c as HTMLCanvasElement).toDataURL("image/png"));
  await dialog.getByRole("checkbox", { name: "카드명 표시" }).uncheck();
  await expect.poll(() => preview.evaluate(c => (c as HTMLCanvasElement).toDataURL("image/png"))).not.toBe(initial);
  await dialog.getByRole("checkbox", { name: "카드명 표시" }).check();
  await dialog.getByRole("textbox", { name: "간편 모드 카드명" }).fill("A7－00 이클립스");
  await dialog.getByRole("combobox", { name: "간편 모드 속성" }).selectOption("어둠");
  await dialog.getByRole("combobox", { name: "간편 모드 효과창 스타일" }).selectOption("glass");
  await dialog.getByRole("button", { name: "설정 저장" }).click();
  await expect(dialog).toHaveCount(0);

  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  await expect(dialog.getByRole("textbox", { name: "간편 모드 카드명" })).toHaveValue("A7－00 이클립스");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "3:4 PNG 다운로드" }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toMatch(/^\d+\.png$/);
});
