/** P4: deterministic static inspection only. No Lua execution or automatic OCG certification. */
import type { LinkedCard } from './importedWorkbench';

export type Severity = '오류' | '주의' | '검토';
export type EvidenceKind = '자료 확인' | '정적 의심';
export type AuditFinding = {
  key: string; ruleId: string; severity: Severity; certainty: EvidenceKind;
  themeId: string; passcode: string; title: string; evidence: string;
  source: string; line: number | null; suggestion: string;
};
export type LuaAuditSource = { assetId: string; filename: string; hash: string; content: string; truncated: boolean; unavailable?: boolean };
export type AuditInput = { card: LinkedCard; approvedEffect: string; lua: LuaAuditSource[] };
export type AuditReport = { createdAt: string; engine: 'P4-static-v1'; scope: '카드' | '테마'; themeId: string;
  totalCards: number; scannedCards: number; truncated: boolean; findings: AuditFinding[] };

/** Not cryptographic; only for stable presentation of revision-dependent finding keys. */
function shortFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
const normalized = (s: string) => s.replace(/\s+/g, '').normalize('NFC');
const limited = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 220);
const lineAt = (s: string, offset: number) => offset < 0 ? null : s.slice(0, offset).split('\n').length;
/** Preserve line numbers and ignore line/block comments for cheap heuristic searches. Not a Lua parser. */
const stripComments = (s: string) => s.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, m => m.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, m => ' '.repeat(m.length));

export function analyzeCard(input: AuditInput): AuditFinding[] {
  const { card, approvedEffect, lua } = input;
  const findings: AuditFinding[] = [];
  const add = (ruleId: string, severity: Severity, certainty: EvidenceKind, title: string,
    evidence: string, suggestion: string, source: string, line: number | null = null, revision = '') => {
    findings.push({ key: [card.themeId, card.passcode, ruleId, source, shortFingerprint(revision || evidence)].join('::'),
      ruleId, severity, certainty, themeId: card.themeId, passcode: card.passcode,
      title, evidence: limited(evidence), source, line, suggestion });
  };
  const cdbText = card.sourceCards.map(c => c.effectText).filter(Boolean);

  const originalScripts = card.files.filter(f=>f.kind==='Lua');
  if(originalScripts.length>lua.length) {
    add('LUA_SCAN_LIMIT', '검토', '자료 확인', 'Lua 후보 중 일부만 분석',
      `등록 ${originalScripts.length}개 중 최초 ${lua.length}개의 Lua 본문만 검사했습니다.`,
      '나머지 파일은 별도로 점검해야 합니다. 스캔 결과를 전체 검증으로 취급하지 마세요.', '파일 목록');
  }
  if (card.conflictingSources) {
    const sources = card.sourceCards.map(s => `${s.sourceId}: ${s.name} / ${shortFingerprint(s.effectText)}`).join(' · ');
    add('CDB_CONFLICT', '주의', '자료 확인', '같은 카드 ID에 서로 다른 CDB 원문', sources,
      '원본 파일의 카드명·효과를 비교하고 사용할 기준 버전을 직접 선택하세요.', 'CDB', null, sources);
  }
  if (new Set(card.files.filter(f => f.kind === 'Lua').map(f => f.sha256)).size > 1) {
    const variants = card.files.filter(f => f.kind === 'Lua').map(f => `${f.filename}: ${f.sha256.slice(0,12)}`).join(' · ');
    add('LUA_VARIANTS', '주의', '자료 확인', '동일 카드 ID에 Lua 원본 여러 버전', variants,
      '서로 다른 스크립트의 차이를 확인하고 테스트할 버전을 지정하세요.', 'Lua', null, variants);
  }
  if (approvedEffect.trim() && cdbText.some(effect => normalized(effect) !== normalized(approvedEffect))) {
    const mismatched = card.sourceCards.filter(c => c.effectText && normalized(c.effectText) !== normalized(approvedEffect));
    for (const source of mismatched.slice(0, 12)) {
      add('APPROVED_CDB_DIFF', '주의', '자료 확인', '승인 원문과 CDB 텍스트가 다름',
        `승인: ${limited(approvedEffect)} / CDB: ${limited(source.effectText)}`,
        'CDB가 이전 버전인지 비교하세요. 분석기는 어느 효과가 올바른지 결정하지 않습니다.',
        `CDB:${source.sourceId}`, null, `${source.sourceId}|${approvedEffect}|${source.effectText}`);
    }
  }
  if (card.sourceCards.length === 0 && card.files.some(f => f.kind === 'Lua')) {
    add('MISSING_CDB', '검토', '자료 확인', '연결된 CDB 카드 데이터가 없음', 'Lua가 있지만 현재 테마에 해당 카드 ID의 CDB 원본이 없습니다.',
      'CDB 파일을 추가하거나 카드가 다른 원본에 속하는지 확인하세요.', '파일 목록');
  }
  if ((approvedEffect.trim() || cdbText.some(Boolean)) && !card.files.some(f => f.kind === 'Lua')) {
    add('MISSING_LUA', '검토', '자료 확인', '효과 텍스트에 대응하는 Lua 파일 미등록', '효과 원문은 있지만 현재 브라우저 보관소에 같은 ID Lua가 없습니다.',
      '해당 카드의 구현 방식과 c<ID>.lua 파일 존재 여부를 확인하세요. 외부 라이브러리를 사용하는 경우도 있습니다.', '파일 목록');
  }
  const text = approvedEffect.trim() || cdbText[0] || '';
  const hardOnce = /(?:이\s*카드명의|이\s*카드명[의]?)(?:[\s\S]{0,90}?)(?:1\s*턴에\s*1\s*번|턴에\s*1번)/.test(text);
  const targets = /(?:대상으로\s*(?:하고|하여|발동|선택)|대상으로\s*한다)/.test(text);
  const specialSummon = /특수\s*소환/.test(text);

  for (const src of lua) {
    if (src.unavailable) {
      add('LUA_ORIGINAL_UNAVAILABLE', '주의', '자료 확인', '보관된 Lua 원본을 불러올 수 없음',
        `${src.filename}: 파일 색인은 있지만 이 브라우저에서 원본을 읽지 못했습니다.`,
        '파일 센터에서 원본 다운로드와 저장 상태를 확인하고 필요하다면 다시 가져오세요.', `Lua:${src.assetId}`, null, src.hash);
      continue;
    }
    if (src.truncated) {
      add('LUA_TRUNCATED', '검토', '자료 확인', 'Lua 분석 범위 제한',
        `${src.filename}은 최대 분석 크기를 초과하여 앞부분만 검사했습니다. 아래의 부재 검사는 생략됩니다.`,
        '전체 파일과 실제 EDOPro 로드를 별도로 확인하세요.', `Lua:${src.assetId}`, null, src.hash);
    }
    const clean = stripComments(src.content);
    const base = `Lua:${src.assetId}`;
    const explicit = [...clean.matchAll(/\bfunction\s+c(\d+)\.initial_effect\b/g)];
    for (const match of explicit) if (match[1] !== card.passcode) {
      add('LUA_ID_MISMATCH', '오류', '자료 확인', 'Lua 초기화 함수에 다른 카드 ID 기재',
        `${src.filename}: function c${match[1]}.initial_effect (파일 연결 ID ${card.passcode})`,
        '함수 네임스페이스와 파일 ID를 대조하세요. 승인 원본은 자동 수정하지 않습니다.', base, lineAt(clean, match.index ?? -1), src.hash);
    }
    if (src.truncated) continue;
    const hasInit = /\bfunction\s+(?:s|c\d+)\.initial_effect\s*\(/.test(clean);
    if (!hasInit && text.trim()) {
      add('LUA_INITIAL_EFFECT', '주의', '자료 확인', '효과 카드 Lua에서 initial_effect 정의 미발견',
        `${src.filename}: 읽은 Lua 본문에서 initial_effect 함수가 검색되지 않습니다.`,
        '스크립트 로드 구조 또는 효과 함수 이름을 확인하세요. 이 검사는 실행 테스트가 아닙니다.', base, null, src.hash);
    }
    if (hardOnce && !/\bSetCountLimit\s*\(/.test(clean)) {
      add('COUNT_LIMIT_REVIEW', '검토', '정적 의심', '카드명 기준 1턴 제한 구현 점검',
        `효과 원문은 카드명 기준 1턴 제한을 기술하지만 ${src.filename}에서 SetCountLimit 호출을 찾지 못했습니다.`,
        '실제 effect 객체의 SetCountLimit과 재사용/발동 무효 처리 방식을 점검하세요.', base, null, src.hash + text);
    } else if (hardOnce && /\bSetCountLimit\s*\(\s*1\s*\)/.test(clean)) {
      add('COUNT_LIMIT_PER_COPY', '검토', '정적 의심', '카드명 제한과 개체별 제한 혼동 가능성',
        `${src.filename}: SetCountLimit(1) 형태가 존재합니다. 카드명 기준 공유 제한인지 검토가 필요합니다.`,
        'Project Ignis SetCountLimit(id 등)를 참고하여 효과별 호출을 직접 검증하세요.', base, null, src.hash + text);
    }
    if (targets && !/\bEFFECT_FLAG_CARD_TARGET\b/.test(clean)) {
      add('TARGET_FLAG_REVIEW', '검토', '정적 의심', '대상 지정 효과의 Lua 플래그 확인',
        `${src.filename}: 효과 텍스트에 대상 표현이 있으나 EFFECT_FLAG_CARD_TARGET 문자열이 보이지 않습니다.`,
        'SetProperty와 SetTarget 및 사용한 헬퍼 함수를 확인하세요. 문자열 검색만으로 오류를 확정할 수 없습니다.', base, null, src.hash + text);
    }
    if (specialSummon && !/\bDuel\.SpecialSummon\b|\bCATEGORY_SPECIAL_SUMMON\b|\bAddRitualProcedure\b|\bAddSynchroProcedure\b|\bAddLinkProcedure\b/.test(clean)) {
      add('SUMMON_IMPLEMENTATION_REVIEW', '검토', '정적 의심', '특수 소환 처리 확인 필요',
        `효과 텍스트에는 특수 소환이 있지만 ${src.filename}에서 주요 소환 관련 호출을 찾지 못했습니다.`,
        '헬퍼 함수/소환 절차/다른 파일과의 연결을 직접 확인하세요.', base, null, src.hash + text);
    }
    const defined = new Set([...clean.matchAll(/\bfunction\s+s\.(\w+)\s*\(/g)].map(m=>m[1]));
    const assigned = new Set([...clean.matchAll(/\bs\.(\w+)\s*=/g)].map(m=>m[1]));
    const missing = new Set<string>();
    for (const match of clean.matchAll(/:Set(?:Condition|Cost|Target|Operation)\s*\(\s*s\.(\w+)\s*\)/g)) {
      if (!defined.has(match[1]) && !assigned.has(match[1])) missing.add(match[1]);
    }
    for (const helper of [...missing].slice(0,10)) {
      const pattern = new RegExp(`:Set(?:Condition|Cost|Target|Operation)\\s*\\(\\s*s\\.${helper}\\s*\\)`);
      add('MISSING_LOCAL_CALLBACK', '검토', '정적 의심', 'Lua 효과 콜백 정의 확인 필요',
        `${src.filename}: s.${helper} 호출은 발견되지만 같은 파일 안에서 함수 정의를 찾지 못했습니다.`,
        '외부 등록 함수 또는 파일 후반 정의 여부와 실제 스크립트 로드 결과를 확인하세요.', base, lineAt(clean, clean.search(pattern)), src.hash + helper);
    }
  }
  return findings;
}

export function analyzeBatch(inputs: AuditInput[], themeId: string, totalCards: number, scope:'카드'|'테마'='테마'): AuditReport {
  const findings = inputs.flatMap(analyzeCard);
  const order: Record<Severity,number> = {오류:0,주의:1,검토:2};
  findings.sort((a,b)=>order[a.severity]-order[b.severity]||a.passcode.localeCompare(b.passcode,undefined,{numeric:true})||a.ruleId.localeCompare(b.ruleId));
  return {createdAt:new Date().toISOString(),engine:'P4-static-v1',themeId,scope,
    scannedCards:inputs.length,totalCards,truncated:inputs.length<totalCards,findings};
}