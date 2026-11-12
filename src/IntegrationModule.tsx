import './integration-modules.css';

export type IntegrationKey = 'artlab' | 'cardmaker' | 'designlab' | 'arena';

const MODULES: Record<IntegrationKey, { name: string; path: string; description: string; version: string }> = {
  artlab: { name: '이미지 연구소', path: 'modules/artlab/', description: '임시 일러스트 제작 · 카드별 SVG 합성 · ZIP 이미지 저장', version: 'YGO ART LAB V1.4' },
  cardmaker: { name: '카드 렌더러', path: 'modules/cardmaker/', description: '유희왕 카드 프레임 편집 · 이미지 크롭 · 카드 PNG/JPG/ZIP 출력', version: 'CARD MAKER / main 기준' },
  designlab: { name: '디자인·덱 실험실', path: 'modules/designlab/', description: 'CDB·Lua 교차 검수 · 덱 매수 편집 · YDK 실험', version: 'DESIGN LAB V0.8.3.1' },
  arena: { name: 'PSH 검증 관제실', path: 'modules/arena/', description: '세션·회귀 테스트·MSG16 교착·로그 증거·주간 우선순위', version: 'PSH 관제실 V1.2' },
};

/**
 * P1 임시 동거 모듈. 기존 사이트 기능과 원본 저장소를 수정하지 않고
 * 각 정적 앱을 동일 GitHub Pages 배포물 안에 보존한다.
 * 공통 데이터 모델/API 연결은 별도 P2 검증 대상이다.
 */
export default function IntegrationModule({ moduleId }: { moduleId: IntegrationKey }) {
  const module = MODULES[moduleId];
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const url = `${base}${module.path}`;
  return (
    <section className="integration-module" aria-label={module.name}>
      <div className="integration-module__top">
        <div>
          <span className="integration-module__eyebrow">INTEGRATED WORKSPACE · P1 / BROWSER MODULE</span>
          <h1>{module.name}</h1>
          <p>{module.description}</p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="integration-module__open">작업실 전체 화면 열기 ↗</a>
      </div>
      <div className="integration-module__notice" role="note">
        <strong>통합 초기 단계 · 기존 기능 보존</strong>
        <span>독립 도구를 같은 웹 주소에서 실행합니다. 데이터 자동 동기화 및 프로젝트 사이의 승인/검증 상태 공유는 아직 구현되지 않았습니다.
          기존 사이트의 브라우저 저장 기록도 자동으로 옮겨지지 않습니다. 기존 사이트에서 백업한 다음 가져오기를 이용하세요.</span>
        <small>{module.version} · 카드 ID/원본 파일은 자동으로 수정하지 않습니다.</small>
      </div>
      <iframe className="integration-module__frame" title={module.name} src={url} loading="lazy" referrerPolicy="no-referrer" />
      <p className="integration-module__foot">내장 화면에서 파일 선택 또는 다운로드가 불편하면 ‘작업실 전체 화면 열기’를 사용하세요. 실제 EDOPro 대전은 이 웹사이트만으로 실행되지 않습니다.</p>
    </section>
  );
}
