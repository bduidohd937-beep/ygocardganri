import { test, expect } from "@playwright/test";

test("V3.5.1: 창 높이에 상관없이 편집 미리보기와 드래그 오버레이는 3:4", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto("/ygocardganri/");
  await page.getByRole("button", { name: "카드 렌더러", exact: true }).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');
  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  const dialog=tool.getByRole("dialog",{name:"오버프레임 간편 제작"});
  const wrapper=dialog.locator(".simple-of-interactive");
  const canvas=dialog.locator('canvas[aria-label="3:4 오버프레임 미리보기"]');
  const area=dialog.locator(".simple-of-canvas-wrap");

  // The V3.5 regression was a 0.91 preview ratio caused by max-height.
  for(const viewport of [
    {width:1536,height:900},
    {width:1280,height:680},
    {width:1024,height:768},
    {width:800,height:900},
    {width:390,height:844},
  ]) {
    await page.setViewportSize(viewport);
    await expect(wrapper).toBeVisible();
    await expect.poll(async()=>{
      const bounds=await wrapper.boundingBox();
      return bounds ? Math.round(bounds.width / bounds.height * 10000) / 10000 : null;
    }).toBeCloseTo(.75,2);
    const w=await wrapper.boundingBox(), c=await canvas.boundingBox(), a=await area.boundingBox();
    if (!w || !c || !a) throw Error("미리보기 크기 측정에 실패했습니다.");
    expect(w.width).toBeGreaterThan(150);
    expect(Math.abs(w.width / w.height - .75)).toBeLessThan(.008);
    expect(Math.abs(c.width / c.height - .75)).toBeLessThan(.008);
    expect(Math.abs(c.width / w.width - 1)).toBeLessThan(.008);
    expect(Math.abs(c.height / w.height - 1)).toBeLessThan(.008);
    expect(w.x).toBeGreaterThanOrEqual(a.x - 2);
    expect(w.y).toBeGreaterThanOrEqual(a.y - 2);
    expect(w.x+w.width).toBeLessThanOrEqual(a.x+a.width+2);
    expect(w.y+w.height).toBeLessThanOrEqual(a.y+a.height+2);
  }
  await page.setViewportSize({width:1536,height:900});

  await dialog.getByRole("checkbox",{name:"카드명 표시"}).uncheck();
  await dialog.getByRole("checkbox",{name:"속성 표시"}).uncheck();
  await dialog.getByRole("checkbox",{name:/레벨 아이콘 표시/}).uncheck();
  const artwork=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=90;c.height=120;
    const ctx=c.getContext("2d")!;
    ctx.fillStyle="#31364f";ctx.fillRect(0,0,90,120);
    return c.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name:"비율검수_원화.png",mimeType:"image/png",buffer:Buffer.from(artwork,"base64"),
  });
  await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBe(900);
  const effect=dialog.getByRole("button",{name:"효과창 이동"});
  await expect(effect).toBeVisible();
  const w=await wrapper.boundingBox(), h=await effect.boundingBox();
  if(!w || !h)throw Error("효과창 선택 영역을 측정하지 못했습니다.");
  // Overlay hitboxes must follow the same 900×1200 coordinate grid as the artwork.
  expect((h.x-w.x)/w.width).toBeCloseTo(36/900,2);
  expect((h.y-w.y)/w.height).toBeCloseTo(912/1200,2);
  expect(h.width/w.width).toBeCloseTo(828/900,2);
  expect(h.height/w.height).toBeCloseTo(252/1200,2);
});
