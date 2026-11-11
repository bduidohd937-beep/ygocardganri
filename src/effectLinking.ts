/** P4.3 — per-numbered effect ↔ Lua registration/callback observations. Never execute Lua or certify OCG. */
import { getParsedLua } from './luaAstCache';
import type { AuditInput, AuditFinding, AuditReport, LuaAuditSource } from './staticAnalyzer';

export type LinkStatus = '고유 처리 근거 후보' | '단일 구조 후보' | '판별 불가' | '등록 이펙트 미발견';
export type LinkStage = '발동 조건' | '코스트' | '대상' | '효과 처리';
export type LinkStepStatus = '구조 발견' | '검토 필요' | '판별 불가' | '문구 미인식';
export type EffectLinkStep = {stage: LinkStage; status: LinkStepStatus; textEvidence: string; luaEvidence: string; line: number | null};
export type EffectLinkItem = {
  number: string; text: string; status: LinkStatus;
  luaVariable: string | null; luaLine: number | null; registerLine: number | null;
  operationCallback: string | null; actionEvidence: string; steps: EffectLinkStep[];
};
export type EffectLinkReport = {
  key: string; themeId: string; passcode: string; assetId: string; filename: string;
  sourceLabel: string; coverage: string; effects: EffectLinkItem[];
  unassignedLua: string[]; warning: string[];
};

type Node = {
  type?: string; name?: string; value?: unknown; indexer?: string;
  identifier?: Node; base?: Node; range?: [number, number];
  loc?: {start?: {line?: number}}; arguments?: Node[];
  variables?: Node[]; init?: Node[]; body?: Node[];
};
type Call = {method: string; owner: string | null; line: number | null; args: Node[]; node: Node};
type Numbered = {number: string; text: string; tags: string[]};
type RegisteredEffect = {
  variable: string; line: number | null; registerLine: number | null;
  cloneOf: string | null; methods: Map<string, Call[]>;
  opCallback: string | null; opActions: string[];
  hasDynamicCallback: boolean; duplicateCreate: boolean; registerCount: number;
};
const MAX_AST_NODES = 60000;
const STAGES: LinkStage[] = ['발동 조건','코스트','대상','효과 처리'];
const NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩';
const clean = (s: string, max=160) => s.replace(/\s+/g,' ').trim().slice(0,max);
const fingerprint=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);};
function nameOf(node: Node | undefined): string | null {
  if(!node)return null;
  if(node.type==='Identifier')return node.name||null;
  if(node.type==='MemberExpression'){
    const base=nameOf(node.base);
    return base&&node.identifier?.name?base+'.'+node.identifier.name:null;
  }
  return null;
}
const lineOf=(n:Node)=>n.loc?.start?.line??null;
function walk(value: unknown): Node[] {
  const pending: unknown[]=[value], nodes:Node[]=[];
  while(pending.length){
    const item=pending.pop();if(!item||typeof item!=='object')continue;
    if(Array.isArray(item)){for(let i=item.length-1;i>=0;i--)pending.push(item[i]);continue;}
    const record=item as Record<string,unknown>;
    if(typeof record.type==='string')nodes.push(item as Node);
    if(nodes.length>MAX_AST_NODES)throw new Error('Lua AST 노드 수가 분석 상한을 초과했습니다.');
    for(const [key,child] of Object.entries(record)){
      if(key==='loc'||key==='range'||key==='comments'||key==='scope')continue;
      if(child&&typeof child==='object')pending.push(child);
    }
  }
  return nodes;
}
function asCall(node:Node):Call|null{
  if(!['CallExpression','TableCallExpression','StringCallExpression'].includes(node.type||''))return null;
  const method=nameOf(node.base);if(!method)return null;
  return {method,owner:nameOf(node.base?.base),line:lineOf(node),args:node.arguments||[],node};
}
const ACTIONS = [
  {tag:'특수 소환',text:/특수\s*소환/,calls:['Duel.SpecialSummon','Duel.SpecialSummonStep','Duel.SpecialSummonComplete']},
  {tag:'파괴',text:/파괴/,calls:['Duel.Destroy']},
  {tag:'제외',text:/제외/,calls:['Duel.Remove']},
  {tag:'패에 넣기',text:/패에\s*넣|패로\s*(?:돌려|되돌)/,calls:['Duel.SendtoHand']},
  {tag:'묘지로 보내기',text:/묘지로\s*(?:보내|보낸)/,calls:['Duel.SendtoGrave']},
  {tag:'덱으로 되돌리기',text:/덱으로\s*(?:되돌|돌려|되돌린)/,calls:['Duel.SendtoDeck']},
  {tag:'드로우',text:/드로우/,calls:['Duel.Draw']},
  {tag:'세트',text:/세트한다|세트할\s*수/,calls:['Duel.SSet','Duel.SetSpellTrap']},
  {tag:'데미지',text:/데미지를\s*준다|데미지를\s*줄/,calls:['Duel.Damage']},
  {tag:'회복',text:/LP를\s*회복|라이프\s*포인트를\s*회복/,calls:['Duel.Recover']},
] as const;
function textActions(text:string):string[]{
  // Skip the activation/cost clause when possible. Taking a cost does not imply an effect operation.
  const boundary=text.match(/발동(?:할\s*수\s*있다|한다)[.。\s:]*/);
  const operation=boundary?text.slice((boundary.index||0)+boundary[0].length):text;
  return ACTIONS.filter(action=>action.text.test(operation)).map(x=>x.tag);
}
function actionsIn(nodes:Node[]):string[]{
  const names=new Set(nodes.map(asCall).filter((c):c is Call=>Boolean(c)).map(c=>c.method));
  return ACTIONS.filter(action=>action.calls.some(n=>names.has(n))).map(x=>x.tag);
}
export function splitNumberedEffects(text:string):{parts:Numbered[];warning:string[]} {
  const warning:string[]=[];
  const matches:{number:string;start:number;end:number}[]=[];
  // A symbol in a shared HOPT sentence ("이 카드명의 ①의 효과") is not a section heading.
  const explicit=new RegExp('(['+NUMBERS+'])\\s*[:：.．]', 'g');
  for(const m of text.matchAll(explicit))matches.push({number:m[1],start:m.index||0,end:(m.index||0)+m[0].length});
  const lineStart=new RegExp('(^|[\\r\\n])[ \\t]*(['+NUMBERS+'])[ \\t]+(?=\\S)', 'g');
  for(const m of text.matchAll(lineStart)){
    const start=(m.index||0)+m[1].length+m[0].indexOf(m[2],m[1].length);
    if(!matches.some(k=>k.start===start))matches.push({number:m[2],start,end:start+m[2].length});
  }
  matches.sort((a,b)=>a.start-b.start);
  if(!matches.length)return {parts:text.trim()?[{number:'번호 없음',text:text.trim(),tags:textActions(text)}]:[],warning:['번호 효과 표기를 확실히 식별하지 못했습니다.']};
  if(new Set(matches.map(m=>m.number)).size!==matches.length)warning.push('같은 효과 번호가 반복되어 연결이 모호할 수 있습니다.');
  const parts=matches.map((m,i)=>{
    const snippet=text.slice(m.end,matches[i+1]?.start??text.length).trim();
    return {number:m.number,text:snippet,tags:textActions(snippet)};
  });
  if(text.slice(0,matches[0].start).trim())warning.push('번호 앞 공통 효과·횟수 제한은 개별 번호에 자동 배정하지 않았습니다.');
  return {parts,warning};
}
function selectSource(input:AuditInput):{text:string;label:string;error?:string}{
  if(input.approvedEffect.trim())return {text:input.approvedEffect.trim(),label:'승인 효과 원문'};
  const sources=input.card.sourceCards.filter(c=>c.effectText.trim());
  if(!sources.length)return {text:'',label:'기준 미확인',error:'승인 원문 또는 CDB 효과 문장이 없습니다.'};
  if(new Set(sources.map(s=>s.effectText.replace(/\s+/g,'').normalize('NFC'))).size>1)
    return {text:'',label:'CDB 충돌',error:'서로 다른 CDB 원문이 존재합니다. 기준을 승인하기 전에는 효과 번호를 연결하지 않습니다.'};
  return {text:sources[0].effectText,label:'CDB:'+sources[0].sourceId};
}
function placeholder(input:AuditInput,src:LuaAuditSource,label:string,reason:string,parts:Numbered[]=[],warnings:string[]=[]):EffectLinkReport{
  const key=[input.card.themeId,input.card.passcode,src.assetId,fingerprint(src.hash+'|'+label)].join('::');
  return {key,themeId:input.card.themeId,passcode:input.card.passcode,assetId:src.assetId,filename:src.filename,
    sourceLabel:label,coverage:reason,effects:parts.map(p=>({number:p.number,text:clean(p.text,380),status:'판별 불가',
      luaVariable:null,luaLine:null,registerLine:null,operationCallback:null,actionEvidence:reason,
      steps:STAGES.map(stage=>({stage,status:'판별 불가',textEvidence:'비교 기준 확인 필요',luaEvidence:reason,line:null}))})),
    unassignedLua:[],warning:warnings};
}
function extractEffects(nodes:Node[], warning:string[]):RegisteredEffect[]{
  const init=nodes.filter(n=>n.type==='FunctionDeclaration'&&nameOf(n.identifier)?.endsWith('.initial_effect'));
  if(init.length!==1){warning.push(init.length===0?'initial_effect 단일 정의를 찾지 못했습니다.':'initial_effect 정의가 복수여서 하나로 결정할 수 없습니다.');return [];}
  const localNodes=walk(init[0].body||[]);
  const effects=new Map<string,RegisteredEffect>();
  const ensure=(name:string,line:number|null)=>{
    let current=effects.get(name);
    if(!current){current={variable:name,line,registerLine:null,cloneOf:null,methods:new Map(),opCallback:null,
      opActions:[],hasDynamicCallback:false,duplicateCreate:false,registerCount:0};effects.set(name,current);}
    return current;
  };
  for(const node of localNodes){
    if(!['LocalStatement','AssignmentStatement'].includes(node.type||''))continue;
    for(let i=0;i<(node.variables||[]).length;i++){
      const name=nameOf(node.variables?.[i]),rhs=node.init?.[i];
      if(!name||!rhs||rhs.type!=='CallExpression'||!rhs.base)continue;
      const func=nameOf(rhs.base);
      if(func==='Effect.CreateEffect'){
        const old=effects.get(name);if(old)old.duplicateCreate=true;
        ensure(name,lineOf(node));
      } else if(func?.endsWith('.Clone')){
        const old=effects.get(name);if(old)old.duplicateCreate=true;
        ensure(name,lineOf(node)).cloneOf=nameOf(rhs.base.base);
      }
    }
  }
  for(const node of localNodes){
    const call=asCall(node);if(!call)continue;
    const method=call.method.split('.').at(-1)||'';
    if(method==='RegisterEffect'){
      const arg=nameOf(call.args[0]);
      if(!arg){warning.push('동적 RegisterEffect 인자를 추적하지 못했습니다.');continue;}
      const effect=ensure(arg,null);effect.registerCount++;
      effect.registerLine=call.line;
      continue;
    }
    if(!call.owner||!effects.has(call.owner)||!call.node.base||call.node.base.indexer!==':')continue;
    if(!method.startsWith('Set'))continue;
    const effect=effects.get(call.owner)!;
    const current=effect.methods.get(method)||[];
    current.push(call);effect.methods.set(method,current);
  }
  // Resolve named or anonymous operation callbacks through function definitions, never by identifier spelling.
  const functions=new Map<string,Node>();
  for(const node of nodes){
    if(node.type==='FunctionDeclaration'&&nameOf(node.identifier))functions.set(nameOf(node.identifier)!,node);
    if(node.type==='AssignmentStatement')for(let i=0;i<(node.variables||[]).length;i++){
      if(node.init?.[i]?.type==='FunctionDeclaration'){
        const name=nameOf(node.variables?.[i]);if(name)functions.set(name,node.init![i]);
      }
    }
  }
  for(const effect of effects.values()){
    const oper=effect.methods.get('SetOperation')||[];
    if(oper.length!==1){effect.hasDynamicCallback=oper.length>1;continue;}
    const arg=oper[0].args[0];if(!arg){effect.hasDynamicCallback=true;continue;}
    const name=nameOf(arg);
    const fn=name?functions.get(name):arg.type==='FunctionDeclaration'?arg:null;
    effect.opCallback=name|| (fn?'익명 함수':null);
    if(!fn){effect.hasDynamicCallback=true;continue;}
    effect.opActions=actionsIn(walk(fn.body||[]));
  }
  return [...effects.values()];
}
function signal(text:string,stage:LinkStage):string{
  let re:RegExp;
  if(stage==='발동 조건')re=/.{0,35}(?:했을|되었을|할|있는|놓였을)\s*경우(?:에)?\s*발동.{0,35}/;
  else if(stage==='코스트')re=/.{0,40}(?:패에서\s*[^.①②③④⑤⑥⑦⑧⑨⑩]{0,35}버리고|[1-9]\d*\s*(?:LP|라이프\s*포인트)를?\s*지불하고|이\s*카드를\s*릴리스하고|묘지로\s*보내고|제외하고)\s*발동.{0,25}|.{0,30}코스트로.{0,30}/;
  else if(stage==='대상')re=/.{0,35}대상으로\s*(?:하고|하여|한다|선택하고)\s*(?:발동|할\s*수).{0,35}/;
  else return textActions(text).join(' · ');
  return clean(text.match(re)?.[0]||'',125);
}
function buildSteps(part:Numbered,effect:RegisteredEffect|null,ambiguous:boolean,hasHelper:boolean):EffectLinkStep[]{
  return STAGES.map(stage=>{
    const textEvidence=signal(part.text,stage);
    if(!textEvidence)return {stage,status:'문구 미인식',textEvidence:'해당 단계 문구를 확실히 식별하지 못함',
      luaEvidence:'문구 미인식은 실제 효과 또는 처리 부재를 의미하지 않음',line:null};
    if(!effect)return {stage,status:'판별 불가',textEvidence,luaEvidence:'연결할 Lua 이펙트를 확정하지 못했습니다.',line:null};
    const method:Record<LinkStage,string>={'발동 조건':'SetCondition','코스트':'SetCost','대상':'SetTarget','효과 처리':'SetOperation'};
    const direct=effect.methods.get(method[stage])||[];
    const line=direct[0]?.line??effect.registerLine;
    if(stage==='효과 처리'){
      if(!direct.length)return {stage,status:ambiguous||hasHelper?'판별 불가':'검토 필요',textEvidence,
        luaEvidence:'등록 이펙트의 SetOperation 직접 연결을 확인하지 못함',line};
      if(effect.hasDynamicCallback)return {stage,status:'판별 불가',textEvidence,
        luaEvidence:'SetOperation은 있으나 콜백 본문을 정적으로 확인할 수 없음',line};
      if(part.tags.every(tag=>effect.opActions.includes(tag)))return {stage,status:'구조 발견',textEvidence,
        luaEvidence:'SetOperation('+String(effect.opCallback)+') · 콜백 내 '+effect.opActions.join(' / ')+' 호출 발견(동작 미검증)',line};
      return {stage,status:ambiguous||hasHelper?'판별 불가':'검토 필요',textEvidence,
        luaEvidence:'SetOperation 콜백에서 '+part.tags.join('/')+' 직접 호출 미발견. 다른 헬퍼/분기 가능',line};
    }
    if(direct.length){
      if(stage==='대상'&&!Array.from(effect.methods.get('SetProperty')||[]).some(c=>walk(c.args).some(n=>n.type==='Identifier'&&n.name==='EFFECT_FLAG_CARD_TARGET'))){
        return {stage,status:ambiguous||hasHelper?'판별 불가':'검토 필요',textEvidence,
          luaEvidence:'SetTarget은 발견했지만 해당 이펙트의 대상 플래그 직접 연결은 미확인',line};
      }
      return {stage,status:'구조 발견',textEvidence,luaEvidence:method[stage]+' · 콜백/처리 의미는 아직 미검증',line};
    }
    if(stage==='발동 조건'&&effect.methods.has('SetCode')&&effect.methods.has('SetType'))return {stage,status:'판별 불가',textEvidence,
      luaEvidence:'SetCode/SetType 트리거는 SetCondition 없이 조건을 표현할 수 있음',line};
    return {stage,status:ambiguous||hasHelper?'판별 불가':'검토 필요',textEvidence,
      luaEvidence:method[stage]+' 직접 호출 미발견; 대체 구현/헬퍼 확인 필요',line};
  });
}
export function mapNumberedEffects(input:AuditInput,src:LuaAuditSource):EffectLinkReport{
  const selected=selectSource(input);
  const parsedText=splitNumberedEffects(selected.text);
  if(selected.error)return placeholder(input,src,selected.label,selected.error,[],[selected.error]);
  if(src.unavailable||src.truncated||!src.content.trim())return placeholder(input,src,selected.label,
    src.unavailable?'Lua 원본을 읽을 수 없음':src.truncated?'Lua 원본 크기 제한으로 일부만 검사함':'Lua 원문이 비어 있음',parsedText.parts,parsedText.warning);
  const parsed=getParsedLua(src);
  if(!parsed.ok)return placeholder(input,src,selected.label,'Lua 5.3 파서 구문 분석을 완료하지 못함: '+clean(parsed.error.message,100),parsedText.parts,parsedText.warning);
  const warnings=[...parsedText.warning];
  let nodes:Node[];
  try {nodes=walk(parsed.ast);}catch(e){return placeholder(input,src,selected.label,e instanceof Error?e.message:'AST 분석 범위 초과',parsedText.parts,warnings);}
  const extracted=extractEffects(nodes,warnings);
  const registered=extracted.filter(e=>e.registerCount>0);
  const extraLua=input.lua.filter(l=>!l.unavailable).length>1;
  const helper=nodes.some(n=>n.type==='Identifier'&&n.name==='aux')||nodes.some(n=>n.type==='CallExpression'&&/Add(?:Ritual|Synchro|Xyz|Link|Pendulum)Procedure/.test(nameOf(n.base)||''));
  const duplicates=registered.some(e=>e.duplicateCreate||e.registerCount>1);
  const cloned=registered.some(e=>e.cloneOf!==null);
  const repeatedNumbers=new Set(parsedText.parts.map(p=>p.number)).size!==parsedText.parts.length;
  if(extraLua)warnings.push('해당 카드에 Lua 원본이 여럿 있어 파일별 연결 후보는 최종 버전 결정이 아닙니다.');
  if(helper)warnings.push('소환/효과 보조 헬퍼가 사용되어 직접 콜백 외 구현을 확인할 수 없습니다.');
  if(cloned)warnings.push('Clone()으로 효과가 복제되어 서로 다른 번호 효과인지 직접 확인해야 합니다.');
  if(duplicates)warnings.push('같은 Lua 객체의 재생성/중복 등록이 있어 순서만으로 연결하지 않습니다.');
  const baselineUnknown=extraLua||helper||cloned||duplicates||repeatedNumbers;
  const chosen=new Map<number,RegisteredEffect>();
  const observed=new Map<number,RegisteredEffect[]>();
  for(let i=0;i<parsedText.parts.length;i++){
    const part=parsedText.parts[i];
    if(!part.tags.length){observed.set(i,[]);continue;}
    const candidates=registered.filter(e=>!e.hasDynamicCallback&&part.tags.length>0&&
      part.tags.every(tag=>e.opActions.includes(tag))&&e.opActions.every(tag=>part.tags.includes(tag)));
    observed.set(i,candidates);
  }
  // Reciprocal unique match by executed action families; e1/e2 variable order is never used as evidence.
  if(!baselineUnknown)for(let i=0;i<parsedText.parts.length;i++){
    const candidates=observed.get(i)||[];
    if(candidates.length!==1)continue;
    const candidate=candidates[0];
    const competitor=parsedText.parts.some((_,j)=>j!==i&&(observed.get(j)||[]).includes(candidate));
    if(!competitor)chosen.set(i,candidate);
  }
  if(!baselineUnknown&&parsedText.parts.length===1&&registered.length===1&&!chosen.has(0)){
    const part=parsedText.parts[0],effect=registered[0];
    if(!part.tags.length&&!effect.opActions.length)chosen.set(0,effect);
  }
  const effects:EffectLinkItem[]=parsedText.parts.map((part,i)=>{
    const effect=chosen.get(i)||null;
    const status:LinkStatus=effect?(part.tags.length?'고유 처리 근거 후보':'단일 구조 후보'):
      registered.length===0?'등록 이펙트 미발견':'판별 불가';
    const reason=effect?(part.tags.length?
      '효과 처리 유형 '+part.tags.join('/')+'과 등록 Lua 콜백의 직접 호출이 유일하게 대응함 (정적 후보)':
      '원문과 직접 등록 이펙트가 각각 1개이지만 의미 일치는 확인하지 못함'):
      baselineUnknown?'복수 소스·Clone·헬퍼·중복 등록 등으로 안전한 자동 연결을 보류함':
      part.tags.length===0?'처리 방식의 고유 단서가 없거나 같은 효과가 여러 개 있음':
      (observed.get(i)?.length||0)>1?'처리 함수 유형이 같은 Lua 이펙트가 여럿 있음':
      '효과 문구와 일치하는 고유한 Lua 콜백 처리 함수를 찾지 못함';
    return {number:part.number,text:clean(part.text,600),status,
      luaVariable:effect?.variable||null,luaLine:effect?.line??null,registerLine:effect?.registerLine??null,
      operationCallback:effect?.opCallback||null,actionEvidence:reason,
      steps:buildSteps(part,effect,baselineUnknown,helper)};
  });
  const used=new Set([...chosen.values()].map(e=>e.variable));
  return {key:[input.card.themeId,input.card.passcode,src.assetId,fingerprint(src.hash+'|'+selected.text)].join('::'),
    themeId:input.card.themeId,passcode:input.card.passcode,assetId:src.assetId,filename:src.filename,
    sourceLabel:selected.label,coverage:'번호 효과 '+parsedText.parts.length+'개 / 직접 등록 Lua 객체 '+registered.length+'개 · 정적 연결 후보만 제공',
    effects,unassignedLua:registered.filter(e=>!used.has(e.variable)).map(e=>e.variable+(e.registerLine?' · 등록 '+e.registerLine+'행':'')),warning:warnings};
}
export function enrichReportWithEffectLinks(report:AuditReport,inputs:AuditInput[]):AuditReport{
  const effectLinks:EffectLinkReport[]=[],findings:AuditFinding[]=[...report.findings];
  for(const input of inputs)for(const src of input.lua){
    const result=mapNumberedEffects(input,src);effectLinks.push(result);
    for(const part of result.effects){
      if(!part.luaVariable)continue;
      for(const stage of part.steps){
        if(stage.status!=='검토 필요')continue;
        const evidence=clean(part.number+' '+stage.stage+' / '+stage.textEvidence+' / '+stage.luaEvidence,220);
        findings.push({key:[result.key,part.number,stage.stage,fingerprint(evidence)].join('::'),
          ruleId:'EFFECT_STAGE_REVIEW',severity:'검토',certainty:'정적 의심',themeId:result.themeId,
          passcode:result.passcode,title:part.number+' · '+stage.stage+' 콜백 연결 검토',
          evidence,source:'Lua:'+src.assetId,line:stage.line,
          suggestion:'해당 번호의 텍스트/이펙트 등록/콜백 내부를 직접 비교하고 EDOPro로 검증하세요. 자동 수정·확정 오류 판정은 하지 않습니다.'});
      }
    }
  }
  return {...report,engine:'P4.3-effect-link-v1',effectLinks,findings};
}