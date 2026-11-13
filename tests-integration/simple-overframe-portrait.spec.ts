import { test, expect } from "@playwright/test";
import JSZip from "jszip";

// Valid transparent 1x1 PNG used as a stand-in for the user's local frame/icon ZIP.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=", "base64");

test("YGO STUDIO: 3:4 원본 속성·랭크 에셋 적용, 저장·PNG 다운로드", async ({ page }) => {
  await page.goto("/ygocardganri/");
  await page.getByRole("button", { name: "카드 렌더러", exact: true }).click();
  const tool = page.locator('[data-native-tool="cardmaker"]');

  // Import a minimal valid resource pack: no font file on purpose.
  const zip = new JSZip();
  for (const file of [
    "card-effect.png", "card-spell.png", "card-trap.png",
    "attribute-wind-kr.png", "attribute-dark-kr.png", "attribute-light-kr.png",
    "attribute-earth-kr.png", "attribute-water-kr.png", "attribute-fire-kr.png",
    "attribute-divine-kr.png", "attribute-spell-kr.png", "attribute-trap-kr.png",
    "level.png", "rank.png",
  ]) zip.file(file, PNG);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name: "카드_원본에셋_검증.zip", mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(tool.getByText(/카드_원본에셋_검증.zip/)).toBeVisible();

  await tool.getByRole("tab", { name: "일러스트", exact: true }).click();
  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  const dialog = tool.getByRole("dialog", { name: "오버프레임 간편 제작" });
  await expect(dialog).toBeVisible();
  // Without the original name font, the user must be told what is missing,
  // rather than getting the fabricated Noto header from the old V3 renderer.
  await expect(dialog.getByText(/원본 에셋 필요: font:name/)).toBeVisible();
  await dialog.getByRole("checkbox", { name: "카드명 표시" }).uncheck();

  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 90; canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#38165c";
    ctx.fillRect(0, 0, 90, 120);
    ctx.fillStyle = "#e88fdc";
    ctx.fillRect(10, 12, 50, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name: "오버프레임_3대4_원화.png", mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const preview = dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  await expect.poll(() => preview.evaluate(c => (c as HTMLCanvasElement).width)).toBe(900);
  await expect.poll(() => preview.evaluate(c => (c as HTMLCanvasElement).height)).toBe(1200);

  // Set Xyz/Rank and verify the imported PNG really changes the canvas.
  await dialog.getByRole("combobox", { name: "간편 모드 카드 종류" }).selectOption("xyz");
  await dialog.getByRole("spinbutton", { name: "간편 모드 레벨/랭크" }).fill("5");
  await dialog.getByRole("combobox", { name: "간편 모드 속성" }).selectOption("어둠");
  await expect(dialog.getByText(/적용 중: 기존 카드명 폰트/)).toBeVisible();
  const capture = () => preview.evaluate(c => (c as HTMLCanvasElement).toDataURL("image/png"));
  const initial = await capture();
  await dialog.getByRole("checkbox", { name: "랭크 아이콘 표시" }).uncheck();
  await expect.poll(capture).not.toBe(initial);
  await dialog.getByRole("checkbox", { name: "랭크 아이콘 표시" }).check();
  await dialog.getByRole("textbox", { name: "간편 모드 카드명" }).fill("A7－00 이클립스");
  await dialog.getByRole("combobox", { name: "간편 모드 효과창 스타일" }).selectOption("glass");
  await dialog.getByRole("button", { name: "설정 저장" }).click();
  await expect(dialog).toHaveCount(0);

  await tool.getByRole("button", { name: "3:4 간편 모드 열기" }).click();
  await expect(dialog.getByRole("textbox", { name: "간편 모드 카드명" })).toHaveValue("A7－00 이클립스");
  await expect(dialog.getByRole("spinbutton", { name: "간편 모드 레벨/랭크" })).toHaveValue("5");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "3:4 PNG 다운로드" }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toMatch(/^\d+\.png$/);
});
