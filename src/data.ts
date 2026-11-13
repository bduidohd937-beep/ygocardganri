/** YGO CARD STUDIO — 최초 데이터는 사용자 확정 사실만 기록한다. */
import {initialGenericRecords,type GenericRecord} from './genericCatalog';
export type StageIndex = -1 | 0 | 1 | 2;
export type ApprovalStatus = '미확인' | '초안' | '검토중' | '승인' | '반려';
export type RuleStatus = '미확인' | '검토중' | '충돌 확인' | '충돌 없음 확인';
export type BalanceStatus = '미확인' | '검토중' | '수정 필요' | '통과';
export type EngineStatus = '미확인' | '미착수' | '진행중' | '완료' | '검증완료';
export type WorldStage = { phase: number; title: string; lore: string; design: string; source: string; status: '미확인' | '제안' | '검토중' | '확정' };
export type World = {
  id: string; name: string; mechanism: string; concept: string; accent: string;
  shortLabel: string; stages: WorldStage[];
};
export type Proposal = {
  id: string; text: string; note: string; status: '미승인' | '승인' | '반려';
  createdAt: string; decidedAt?: string;
};
export type Card = {
  id: string; worldId: string; phase: StageIndex; name: string; confirmedName: boolean; protectedName: boolean;
  level: number | null; attribute: string; race: string; monsterType: string;
  atk: number | null; def: number | null;
  design: string; artUrl: string; artStatus: ApprovalStatus;
  effect: string; effectSource: string; proposals: Proposal[];
  approval: ApprovalStatus; ocg: RuleStatus; ocgNote: string;
  balance: BalanceStatus; balanceNote: string;
  cdb: EngineStatus; lua: EngineStatus; duel: EngineStatus;
  source: string; notes: string; version: number; updatedAt: string;
};
export type History = {
  id: string; at: string; action: string; entity: 'card' | 'world' | 'project'; entityId: string;
  entityName: string; field: string; before: string; after: string; memo: string;
};
export type StudioData = { schemaVersion: 1; worlds: World[]; cards: Card[]; history: History[]; genericCards?:GenericRecord[] };

export const PHASES = ['첫 고난', '극복', '지배'] as const;
export const APPROVAL_OPTIONS: ApprovalStatus[] = ['미확인','초안','검토중','승인','반려'];
export const RULE_OPTIONS: RuleStatus[] = ['미확인','검토중','충돌 확인','충돌 없음 확인'];
export const BALANCE_OPTIONS: BalanceStatus[] = ['미확인','검토중','수정 필요','통과'];
export const ENGINE_OPTIONS: EngineStatus[] = ['미확인','미착수','진행중','완료','검증완료'];

const WORLD_SEEDS = [
  { id: 'blood', name: '혈성', mechanism: '융합 / LP', concept: '생명력과 융합', accent: '#AF665F', shortLabel: 'BLOOD', abel: '피를 갈구하는 자－아벨' },
  { id: 'clock', name: '영각시계', mechanism: '싱크로 / 24시간', concept: '시간의 흐름과 24시간', accent: '#879EB6', shortLabel: 'HOUR', abel: '시간이 멈춘 자－아벨' },
  { id: 'grave', name: '심연묘역', mechanism: '엑시즈 / 기억', concept: '기억 봉인·발굴·재매장', accent: '#789BAA', shortLabel: 'ABYSS', abel: '무덤에 묻힌 자－아벨' },
  { id: 'sky', name: '천망성역', mechanism: '링크 / 감시망', concept: '연결과 감시망', accent: '#BCAC84', shortLabel: 'SKY', abel: '천상에서 추방된 자－아벨' },
  { id: 'fate', name: '파계잔영', mechanism: '펜듈럼', concept: '펜듈럼 소환', accent: '#A28EBD', shortLabel: 'FATE', abel: '운명에 갇힌 자－아벨' },
] as const;

// 보관된 별도 V0.2 공통 카드 백업에서 확인한 설계 원문. OCG / EDOPro 검증 전.
const COMMON_EFFECT = `이 카드명의 ①②의 효과는 각각 1턴에 1번밖에 사용할 수 없다.\n\n①: 이 카드가 일반 소환 / 특수 소환했을 경우에 발동할 수 있다. 자신의 덱 / 묘지에서 "기억을 잃은 자－아벨"의 카드명이 쓰여진 "기억을 잃은 자－아벨" 이외의 카드 1장을 패에 넣는다.\n\n②: 이 카드가 묘지에 존재할 경우, 자신의 패 / 필드의 카드 1장을 묘지로 보내고 발동할 수 있다. 이 카드를 특수 소환한다. 이 효과로 특수 소환한 이 카드는 필드에서 벗어날 경우에 제외된다.`;

export function displayName(card: Card): string {
  if (card.name.trim()) return card.name;
  if (card.phase === 1) return '1차 진화 · 명칭 미확인';
  if (card.phase === 2) return '2차 진화 · 명칭 미확인';
  return '카드명 미확인';
}

export function createInitialData(): StudioData {
  const now = '2026-11-11T00:00:00.000Z';
  const worlds: World[] = WORLD_SEEDS.map(w => ({
    id: w.id, name: w.name, mechanism: w.mechanism, concept: w.concept,
    accent: w.accent, shortLabel: w.shortLabel,
    stages: PHASES.map((title, phase) => ({ phase, title, lore: '', design: '', source: '', status: '미확인' })),
  }));
  const cards: Card[] = WORLD_SEEDS.flatMap(w => PHASES.map((_, phase) => ({
    id: `${w.id}-${phase}`, worldId: w.id, phase: phase as StageIndex,
    name: phase === 0 ? w.abel : '', confirmedName: phase === 0, protectedName: phase === 0,
    level: phase === 0 ? 4 : null, attribute: '', race: '', monsterType: '',
    atk: null, def: null, design: '', artUrl: '', artStatus: '미확인' as ApprovalStatus,
    effect: '', effectSource: '', proposals: [], approval: '미확인' as ApprovalStatus,
    ocg: '미확인' as RuleStatus, ocgNote: '', balance: '미확인' as BalanceStatus,
    balanceNote: '', cdb: '미확인' as EngineStatus, lua: '미확인' as EngineStatus,
    duel: '미확인' as EngineStatus,
    source: phase === 0 ? '사용자 확정: 세계별 레벨 4 아벨 이름 (2026-11-11)' : '',
    notes: '', version: 1, updatedAt: now,
  })));
  cards.push({
    id: 'common-abel', worldId: 'common', phase: -1, name: '기억을 잃은 자－아벨',
    confirmedName: true, protectedName: true, level: 4, attribute: '빛',
    race: '마법사족', monsterType: '효과 몬스터', atk: 1500, def: 1500,
    design: '', artUrl: '', artStatus: '미확인',
    effect: COMMON_EFFECT,
    effectSource: '기억을_잃은_자-아벨_V0.2_공통원문_백업 (설계 원문 / OCG·EDOPro 검증 전)',
    proposals: [], approval: '미확인', ocg: '미확인', ocgNote: '일부 재정 검수 대기',
    balance: '미확인', balanceNote: '공통 서치 범위 검토 전',
    cdb: '미확인', lua: '미확인', duel: '미확인',
    source: '공통 기본형 카드 V0.2 백업',
    notes: '여섯 세력 공유 기본형. 신규 《무명성서》 세계별 아벨 5종과 다른 카드.',
    version: 2, updatedAt: now,
  });
  return { schemaVersion: 1, worlds, cards, history: [], genericCards:initialGenericRecords() };
}

export function countUnknown(data: StudioData) {
  return data.cards.reduce((sum, c) => sum + [
    !c.name, c.level === null, !c.attribute, !c.race, !c.monsterType,
    !c.design, !c.effect, c.artStatus === '미확인', c.approval === '미확인',
    c.ocg === '미확인', c.balance === '미확인', c.cdb === '미확인',
    c.lua === '미확인', c.duel === '미확인',
  ].filter(Boolean).length, 0);
}

export function isAllowedArtworkUrl(value: string) {
  if (!value.trim()) return true;
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}