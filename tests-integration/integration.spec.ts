import { test, expect } from '@playwright/test';

// 통합 스모크 검사: 독립 도구의 실제 페이지와 정적 리소스가 한 웹 주소에서 열리는지 확인.
// 카드/덱/원본의 데이터 공유 및 EDOPro 실전 검증 테스트는 아니다.
test('YGO STUDIO 통합 메뉴에서 4개 정적 모듈을 불러온다', async ({ page }) => {
  await page.goto('/ygocardganri/');
  const modules = [
    { nav: '이미지 연구소', title: '이미지 연구소', path: 'artlab', text: 'YGO ART LAB' },
    { nav: '카드 렌더러', title: '카드 렌더러', path: 'cardmaker', text: 'CARD STUDIO' },
    { nav: '디자인·덱 실험실', title: '디자인·덱 실험실', path: 'designlab', text: 'DESIGN LAB' },
    { nav: 'PSH 검증 관제실', title: 'PSH 검증 관제실', path: 'arena', text: 'MSG16 응답 이후' },
  ];
  for (const module of modules) {
    await page.getByRole('button', { name: module.nav, exact: true }).click();
    await expect(page.locator(`iframe[title="${module.title}"]`)).toHaveAttribute(
      'src', `/ygocardganri/modules/${module.path}/`,
    );
    await expect(page.frameLocator(`iframe[title="${module.title}"]`).locator('body')).toContainText(
      module.text, { timeout: 20000 },
    );
    await expect(page.getByText('데이터 자동 동기화 및 프로젝트 사이의 승인/검증 상태 공유는 아직 구현되지 않았습니다.', { exact: false })).toBeVisible();
  }
});
