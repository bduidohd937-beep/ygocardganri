/** P4.1: parse Lua source into an AST. NEVER execute a card script or write to the input. */
import { getParsedLua } from './luaAstCache';
import type { AuditFinding, AuditInput, AuditReport, LuaAuditSource } from './staticAnalyzer';

export type LuaPatch = {
  assetId: string; sourceHash: string; filename: string;
  start: number; end: number; before: string; after: string;
  reason: string; confidence: '검토 필요';
};

type Node = {
  type?: string; name?: string; value?: unknown; indexer?: string;
  identifier?: Node; base?: Node; range?: [number, number];
  loc?: { start?: { line?: number } };
  arguments?: Node[]; variables?: Node[]; init?: Node[];
};
const hardOnce = (s: string) => /이\s*카드명(?:의)?[\s\S]{0,100}?1\s*턴에\s*1\s*번/.test(s);

function walk(value: unknown): Node[] {
  const stack: unknown[] = [value];
  const nodes: Node[] = [];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item)) { for (let i = item.length - 1; i >= 0; i--) stack.push(item[i]); continue; }
    const obj = item as Record<string, unknown>;
    if (typeof obj.type === 'string') nodes.push(obj as Node);
    for (const [key, nested] of Object.entries(obj)) {
      if (key === 'loc' || key === 'range' || key === 'comments') continue;
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
  return nodes;
}
function memberName(node: Node | undefined): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name || null;
  if (node.type !== 'MemberExpression') return null;
  const base = memberName(node.base);
  const name = node.identifier?.name;
  return base && name ? base + '.' + name : null;
}
function sourceLine(node: Node) { return node.loc?.start?.line ?? null; }
function stampKey(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
function newFinding(input: AuditInput, source: LuaAuditSource, ruleId: string,
  title: string, evidence: string, suggestion: string, line: number | null, patch?: LuaPatch): AuditFinding {
  const { card } = input;
  return {
    key: [card.themeId, card.passcode, ruleId, 'Lua:' + source.assetId, stampKey(source.hash + '|' + line + '|' + evidence)].join('::'),
    ruleId, severity: ruleId === 'AST_NAMESPACE_MISMATCH' ? '주의' : '검토',
    certainty: '정적 의심', themeId: card.themeId, passcode: card.passcode,
    title, evidence: evidence.slice(0, 220), suggestion,
    source: 'Lua:' + source.assetId, line, patch,
  };
}
function candidate(source: LuaAuditSource, start: number, end: number, after: string, reason: string): LuaPatch | undefined {
  if (source.truncated || source.unavailable || start < 0 || end <= start || end > source.content.length || end - start > 300) return undefined;
  return { assetId: source.assetId, sourceHash: source.hash, filename: source.filename,
    start, end, before: source.content.slice(start, end), after, reason, confidence: '검토 필요' };
}

/** Parse structure, tracking function declarations and effect methods. Unknown engine helpers remain review candidates. */
export function inspectLuaAst(input: AuditInput, src: LuaAuditSource): AuditFinding[] {
  if (src.unavailable || src.truncated || !src.content.trim()) return [];
  const parsed = getParsedLua(src);
  if (!parsed.ok) {
    const e = parsed.error;
    return [newFinding(input, src, 'AST_PARSE_REVIEW', 'Lua 5.3 구문 분석 불가',
      e.message.slice(0, 160),
      '이 결과만으로 EDOPro 문법 오류를 확정하지 마세요. 확장 문법이나 파서 호환성, Lua 원문을 비교하세요.',
      e.line ?? null)];
  }
  const nodes = walk(parsed.ast);
  const functions = new Set<string>();
  const initFunctions: Node[] = [];
  for (const node of nodes) {
    if (node.type === 'FunctionDeclaration') {
      const name = memberName(node.identifier);
      if (name) { functions.add(name); if (name.endsWith('.initial_effect')) initFunctions.push(node); }
    }
    if (node.type === 'AssignmentStatement') {
      for (let i = 0; i < (node.variables || []).length; i++) {
        if (node.init?.[i]?.type === 'FunctionDeclaration') {
          const name = memberName(node.variables?.[i]);
          if (name) functions.add(name);
        }
      }
    }
  }
  const found: AuditFinding[] = [];
  const effectText = input.approvedEffect.trim() || input.card.sourceCards[0]?.effectText || '';
  const hasIdAlias = /(?:^|\n)\s*local\s+s\s*,\s*id\s*=\s*GetID\s*\(\s*\)/.test(src.content);
  for (const fn of initFunctions) {
    const root = fn.identifier?.base;
    const name = root?.type === 'Identifier' ? root.name || '' : '';
    if (!/^c\d+$/.test(name) || name === 'c' + input.card.passcode) continue;
    const range = root?.range;
    const patch = range ? candidate(src, range[0], range[1], 'c' + input.card.passcode,
      '초기화 함수의 네임스페이스가 파일과 연결된 카드 ID와 다른지 확인하세요.') : undefined;
    found.push(newFinding(input, src, 'AST_NAMESPACE_MISMATCH', '초기화 함수의 카드 ID 불일치',
      src.filename + ': ' + name + '.initial_effect / 연결 카드 ID ' + input.card.passcode,
      '함수명뿐 아니라 관련 테이블 참조도 확인해야 합니다. 자동 반영되지 않습니다.', sourceLine(fn), patch));
  }

  const registered = new Set<string>();
  const created = new Set<string>();
  const unresolved = new Map<string, number | null>();
  for (const node of nodes) {
    if (node.type !== 'CallExpression' && node.type !== 'TableCallExpression' && node.type !== 'StringCallExpression') continue;
    const call = node.base;
    if (!call || call.type !== 'MemberExpression') continue;
    const method = call.identifier?.name;
    if (!method) continue;
    const owner = memberName(call.base);
    if (method === 'CreateEffect' && owner === 'Effect') created.add('Effect.CreateEffect');
    if (method === 'RegisterEffect') registered.add('RegisterEffect');
    if (['SetCondition','SetCost','SetTarget','SetOperation'].includes(method) && call.indexer === ':') {
      const callback = node.arguments?.[0];
      const path = memberName(callback);
      if (path?.startsWith('s.') && !functions.has(path)) unresolved.set(path, sourceLine(node));
    }
    if (method === 'SetCountLimit' && call.indexer === ':' && hardOnce(effectText) && hasIdAlias &&
      node.arguments?.length === 1 && node.arguments[0].type === 'NumericLiteral' && node.arguments[0].value === 1) {
      const range = node.range;
      const original = range ? src.content.slice(range[0], range[1]) : '';
      const next = original.replace(/\(\s*1\s*\)$/, '(1,id)');
      const patch = range && next !== original ? candidate(src, range[0], range[1], next,
        '카드명 공유 횟수 제한 의도를 재정·실전에서 확인한 후 비교하세요.') : undefined;
      found.push(newFinding(input, src, 'AST_COUNT_LIMIT_CANDIDATE', '카드명 기준 횟수 제한 수정 검토안',
        src.filename + ': ' + original.slice(0, 110),
        '공식 스크립트의 SetCountLimit(1,id) 등 사례와 대조하세요. OATH·효과별 ID 오프셋 등은 수동 판단이 필요합니다.',
        sourceLine(node), patch));
    }
  }
  for (const [name, line] of [...unresolved.entries()].slice(0, 15)) {
    found.push(newFinding(input, src, 'AST_CALLBACK_UNRESOLVED', '효과에 등록된 콜백의 정의를 AST에서 확인하지 못함',
      src.filename + ': ' + name + ' — AST 내 함수 선언/할당 미발견',
      '다른 파일·라이브러리·동적 할당을 사용하는지 확인하세요. 임의의 빈 함수를 생성하면 안 됩니다.', line));
  }
  if (initFunctions.length && created.size && !registered.size) {
    found.push(newFinding(input, src, 'AST_EFFECT_REGISTRATION_REVIEW', '효과 객체 등록 코드 확인 필요',
      src.filename + ': Effect.CreateEffect는 있으나 RegisterEffect 직접 호출을 찾지 못했습니다.',
      '보조 헬퍼나 다른 소환 절차를 사용하는지 확인하고 EDOPro 엔진 로드로 검증하세요.', sourceLine(initFunctions[0])));
  }
  return found;
}
/** Adds a parser layer to the existing deterministic inspection without mutating prior results. */
export function enrichReportWithAst(report: AuditReport, inputs: AuditInput[]): AuditReport {
  const extras = inputs.flatMap(input => input.lua.flatMap(src => inspectLuaAst(input, src)));
  const order = {오류:0,주의:1,검토:2};
  const findings = [...report.findings, ...extras].sort((a,b)=>order[a.severity]-order[b.severity]||
    a.passcode.localeCompare(b.passcode,undefined,{numeric:true})||a.ruleId.localeCompare(b.ruleId));
  return {...report, engine: 'P4.1-ast-v1', findings};
}
