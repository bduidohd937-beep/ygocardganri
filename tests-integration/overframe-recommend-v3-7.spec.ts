import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PNG=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/UI8AAAAASUVORK5CYII=","base64");

test("V3.7 원화 밝기·윤곽선 추천 3종 실제 미리보기→배치 적용·되돌리기·저장",async({page})=>{
  await page.goto("/ygocardganri/");
  await page.getByRole("button",{name:"카드 렌더러",exact:true}).click();
  const tool=page.locator('[data-native-tool="cardmaker"]');

  const fonts=".integration_sources/cardmaker/node_modules/@fontsource-variable/noto-sans-kr/files";
  const fontName=(await readdir(fonts)).filter(s=>s.endsWith(".woff2")).sort()[0];
  if(!fontName)throw Error("테스트용 카드 폰트를 찾지 못했습니다.");
  const assetZip=new JSZip();
  for(const name of [
    "card-effect.png","card-spell.png","card-trap.png",
    "attribute-wind-kr.png","attribute-dark-kr.png","attribute-light-kr.png",
    "attribute-earth-kr.png","attribute-water-kr.png","attribute-fire-kr.png",
    "attribute-divine-kr.png","attribute-spell-kr.png","attribute-trap-kr.png",
    "level.png","rank.png",
  ])assetZip.file(name,PNG);
  const font=await readFile(join(fonts,fontName));
  for(const name of ["ygo-kr-name.woff2","ygo-kr-race.woff2","ygo-kr.woff2"])
    assetZip.file(name,font);
  await tool.locator('input[aria-label="카드 프레임 리소스 ZIP"]').setInputFiles({
    name:"원본에셋_V37_검증.zip",mimeType:"application/zip",
    buffer:await assetZip.generateAsync({type:"nodebuffer"}),
  });
  await expect(tool.getByText(/원본에셋_V37_검증.zip/)).toBeVisible();

  await tool.getByRole("tab",{name:"오버프레임",exact:true}).click();
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  const dialog=tool.getByRole("dialog",{name:"오버프레임 간편 제작"});

  const art=await page.evaluate(()=>{
    const c=document.createElement("canvas");
    c.width=90;c.height=120;
    const ctx=c.getContext("2d")!;
    for(let y=0;y<c.height;y++){
      ctx.fillStyle=y>84?(y%5<2?"#d1dde1":"#252a40"):"#273149";
      ctx.fillRect(0,y,c.width,1);
    }
    return c.toDataURL("image/png").split(",")[1];
  });
  await tool.locator('input[aria-label="3대4 오버프레임 원화 파일"]').setInputFiles({
    name:"918760001_원화.png",mimeType:"image/png",buffer:Buffer.from(art,"base64"),
  });
  await expect(dialog.getByText("원화 밝기·윤곽선 분석 완료")).toBeVisible();
  for(const label of ["기본 OCG형","중앙 일러스트형","하단 효과창형"]){
    await expect(dialog.getByAltText(label+" 추천 미리보기")).toBeVisible();
    await expect(dialog.getByRole("button",{name:label+" 추천 적용"})).toBeEnabled();
  }

  const y=dialog.getByRole("spinbutton",{name:"효과창 Y"});
  await expect(y).toHaveValue("912");
  await dialog.getByRole("button",{name:"하단 효과창형 추천 적용"}).click();
  await expect(y).toHaveValue("1010");
  await dialog.getByRole("button",{name:/추천 적용 전 배치로 되돌리기/}).click();
  await expect(y).toHaveValue("912");
  await dialog.getByRole("button",{name:"중앙 일러스트형 추천 적용"}).click();
  await expect(y).toHaveValue("970");

  // Preview action alone is in editor state; explicit Save persists it.
  await dialog.getByRole("button",{name:"설정 저장"}).click();
  await expect(dialog).toHaveCount(0);
  await tool.getByRole("button",{name:"3:4 간편 모드 열기"}).click();
  await expect(y).toHaveValue("970");
  await expect(dialog.getByText("원화 밝기·윤곽선 분석 완료")).toBeVisible();
  await dialog.getByRole("button",{name:"취소",exact:true}).click();

  await tool.getByRole("button",{name:/여러 장 일괄 제작/}).click();
  const batch=tool.getByRole("dialog",{name:"오버프레임 일괄 제작·ZIP 출력"});
  const mode=batch.getByRole("combobox",{name:"일괄 배치 프리셋"});
  await mode.selectOption("recommend");
  await expect(mode).toHaveValue("recommend");
  await expect(batch.getByText(/원화 픽셀을 반영하는 상세 추천은 카드별/)).toBeVisible();
  await batch.getByRole("button",{name:"닫기",exact:true}).click();
});
