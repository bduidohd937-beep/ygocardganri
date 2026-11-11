/** P4.2 CDB/approved text ↔ Lua AST. Read-only observations, never an OCG verdict. */
import { getParsedLua } from './luaAstCache';
import type { AuditFinding, AuditInput, AuditReport, LuaAuditSource } from './staticAnalyzer';

export type AlignmentStage = '발동 조건' | '코스트' | '대상' | '효과 처리';
export type AlignmentStatus = '구조 발견' | '검토 필요' | '판별 불가' | '문구 없음';
export type AlignmentStep = {stage: AlignmentStage; status: AlignmentStatus; textEvidence: string; luaEvidence: string; line: number | null};
export type EffectAlignment = {key:string;themeId:string;passcode:string;luaAssetId:string;filename:string;sourceLabel:string;originalSnippet:string;coverage:string;steps:AlignmentStep[]};
type AstNode = {type?:string;name?:string;value?:unknown;indexer?:string;identifier?:AstNode;base?:AstNode;range?:[number,number];loc?:{start?:{line?:number}};arguments?:AstNode[]};
type Call = {name:string;receiver:string|null;line:number|null;args:AstNode[]};
const stages:AlignmentStage[]=['발동 조건','코스트','대상','효과 처리'];
const compact=(s:string,n=115)=>s.replace(/\s+/g,' ').trim().slice(0,n);
const fingerprint=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);};
function walk(root:unknown):AstNode[]{
  const pending:unknown[]=[root],found:AstNode[]=[];
  while(pending.length){
    const v=pending.pop();if(!v||typeof v!=='object')continue;
    if(Array.isArray(v)){for(let i=v.length-1;i>=0;i--)pending.push(v[i]);continue;}
    const obj=v as Record<string,unknown>;
    if(typeof obj.type==='string')found.push(obj as AstNode);
    if(found.length>60000)throw Error('AST 검사 제한 초과');
    for(const [k,child] of Object.entries(obj))if(!['loc','range','comments','scope'].includes(k)&&child&&typeof child==='object')pending.push(child);
  }
  return found;
}
function nodeName(n:AstNode|undefined):string|null{
  if(!n)return null;
  if(n.type==='Identifier')return n.name||null;
  if(n.type==='MemberExpression'){const owner=nodeName(n.base);return owner&&n.identifier?.name?owner+'.'+n.identifier.name:null;}
  return null;
}
const lineno=(n:AstNode)=>n.loc?.start?.line??null;
function callNode(n:AstNode):Call|null{
  if(!['CallExpression','TableCallExpression','StringCallExpression'].includes(n.type||''))return null;
  const name=nodeName(n.base);if(!name)return null;
  return {name,receiver:nodeName(n.base?.base),line:lineno(n),args:n.arguments||[]};
}
function chooseText(input:AuditInput):{value:string;label:string;reason?:string}{
  if(input.approvedEffect.trim())return {value:input.approvedEffect.trim(),label:'승인 효과 원문 (CDB와 다를 수 있음)'};
  const candidates=input.card.sourceCards.filter(s=>s.effectText.trim());
  if(!candidates.length)return {value:'',label:'미확인',reason:'승인 원문과 CDB 효과 텍스트가 모두 없습니다.'};
  if(new Set(candidates.map(s=>s.effectText.replace(/\s+/g,'').normalize('NFC'))).size>1)
    return {value:'',label:'CDB 원문 충돌',reason:'서로 다른 CDB 원문이 있어 비교 기준을 선택할 수 없습니다.'};
  return {value:candidates[0].effectText,label:'CDB:'+candidates[0].sourceId};
}
function signal(text:string,stage:AlignmentStage):string{
  let pattern:RegExp;
  if(stage==='발동 조건')pattern=/.{0,35}(?:했을|되었을|할|있는|놓였을)\s*경우(?:에)?\s*발동.{0,35}/;
  else if(stage==='코스트')pattern=/.{0,40}(?:패에서\s*[^.①②③④⑤⑥⑦⑧⑨⑩]{0,35}버리고|[1-9]\d*\s*(?:LP|라이프\s*포인트)를?\s*지불하고|이\s*카드를\s*릴리스하고|묘지로\s*보내고|제외하고)\s*발동.{0,25}|.{0,25}코스트로.{0,30}/;
  else pattern=/.{0,35}대상으로\s*(?:하고|하여|한다|선택하고)\s*(?:발동|할\s*수).{0,35}/;
  return compact(text.match(pattern)?.[0]||'');
}
const operations=[
  {label:'특수 소환',pattern:/특수\s*소환/,calls:['Duel.SpecialSummon','Duel.SpecialSummonStep','Duel.SpecialSummonComplete']},
  {label:'파괴',pattern:/파괴/,calls:['Duel.Destroy']},
  {label:'제외',pattern:/제외/,calls:['Duel.Remove']},
  {label:'패에 넣기',pattern:/패에\s*넣/,calls:['Duel.SendtoHand']},
  {label:'묘지로 보내기',pattern:/묘지로\s*보낸다/,calls:['Duel.SendtoGrave']},
];
function unavailable(input:AuditInput,src:LuaAuditSource,label:string,reason:string,text:string):EffectAlignment{
  return {key:[input.card.themeId,input.card.passcode,src.assetId,fingerprint(src.hash+'|'+label+'|'+text)].join('::'),
    themeId:input.card.themeId,passcode:input.card.passcode,luaAssetId:src.assetId,filename:src.filename,
    sourceLabel:label,originalSnippet:compact(text,250),coverage:reason,
    steps:stages.map(stage=>({stage,status:'판별 불가',textEvidence:'비교 불가',luaEvidence:reason,line:null}))};
}
/** One alignment per original Lua file. Multiple numbered effects cannot be mapped by name alone. */
export function compareCardEffect(input:AuditInput,src:LuaAuditSource):EffectAlignment{
  const text=chooseText(input);
  if(text.reason)return unavailable(input,src,text.label,text.reason,text.value);
  if(src.unavailable)return unavailable(input,src,text.label,'Lua 원본을 읽을 수 없어 비교하지 않았습니다.',text.value);
  if(src.truncated)return unavailable(input,src,text.label,'원본 일부만 읽어 누락 판정을 하지 않았습니다.',text.value);
  if(!src.content.trim())return unavailable(input,src,text.label,'Lua 원문이 비어 있습니다.',text.value);
  const parsed=getParsedLua(src);
  if(!parsed.ok)return unavailable(input,src,text.label,'Lua AST 파싱 불가: 구문 또는 파서 호환성을 검토하세요.',text.value);
  let nodes:AstNode[];
  try{nodes=walk(parsed.ast);}
  catch{return unavailable(input,src,text.label,'Lua AST 검사 범위를 초과했습니다.',text.value);}
  const calls=nodes.map(callNode).filter((c):c is Call=>c!==null);
  const registered=new Set<string>();
  for(const call of calls){
    if(call.name.endsWith('.RegisterEffect')&&call.args[0]?.type==='Identifier'&&call.args[0].name)
      registered.add(call.args[0].name!);
  }
  const direct=calls.filter(c=>c.receiver!==null&&registered.has(c.receiver));
  const numbered=(text.value.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g)||[]).length>1;
  const severalLua=input.lua.filter(l=>!l.unavailable).length>1;
  const helper=nodes.some(n=>n.type==='Identifier'&&n.name==='aux')||calls.some(c=>/Add(?:Ritual|Synchro|Xyz|Link|Pendulum)Procedure/.test(c.name));
  const scopeIssues=[numbered?'복수 번호 효과':null,severalLua?'Lua 여러 원본':null,!registered.size?'직접 등록 이펙트 미식별':null,registered.size>1?'등록 이펙트 여러 개':null,helper?'보조 헬퍼 사용':null].filter(Boolean);
  const uncertain=scopeIssues.length>0;
  const coverage=uncertain?scopeIssues.join(' · '):'단일 직접 등록 이펙트 '+[...registered][0]+' · 실제 효과 의미는 미검증';
  const step=(stage:AlignmentStage,excerpt:string,methods:string[],alternative:string):AlignmentStep=>{
    if(!excerpt)return {stage,status:'문구 없음',textEvidence:'이 단계의 명시적인 문구를 인식하지 못함',luaEvidence:'문구 미인식은 처리 부재를 의미하지 않음',line:null};
    const found=direct.find(c=>methods.some(m=>c.name.endsWith('.'+m)));
    if(found)return {stage,status:'구조 발견',textEvidence:excerpt,luaEvidence:found.name+(found.line?' · '+found.line+'행':'')+' (의미·시점 미검증)',line:found.line};
    if(uncertain)return {stage,status:'판별 불가',textEvidence:excerpt,luaEvidence:coverage+' · '+alternative,line:null};
    return {stage,status:'검토 필요',textEvidence:excerpt,luaEvidence:'단일 등록 이펙트에서 '+methods.join('/')+' 직접 연결 미발견. '+alternative,line:null};
  };
  const condition=step('발동 조건',signal(text.value,'발동 조건'),['SetCondition'],'SetCode/SetType 트리거 또는 헬퍼로 구현될 수 있습니다.');
  // A trigger can be encoded purely in SetCode/SetType. Downgrade missing condition to unknown.
  if(condition.status==='검토 필요'&&calls.some(c=>/\.(?:SetCode|SetType)$/.test(c.name))){
    condition.status='판별 불가';condition.luaEvidence='SetCode/SetType 발견 · 트리거 조건은 SetCondition 없이 표현 가능';
  }
  const cost=step('코스트',signal(text.value,'코스트'),['SetCost'],'다른 코스트 처리/헬퍼 여부 확인 필요');
  const target=step('대상',signal(text.value,'대상'),['SetTarget'],'SetTarget과 EFFECT_FLAG_CARD_TARGET을 함께 확인하세요.');
  if(target.status==='구조 발견'){
    const flag=nodes.some(n=>n.type==='Identifier'&&n.name==='EFFECT_FLAG_CARD_TARGET');
    target.luaEvidence+=flag?' · 대상 플래그 확인됨':' · 대상 플래그 직접 확인되지 않음';
    if(!flag)target.status=uncertain?'판별 불가':'검토 필요';
  }
  const mentioned=operations.filter(x=>x.pattern.test(text.value));
  let operation:AlignmentStep;
  if(!mentioned.length)operation={stage:'효과 처리',status:'문구 없음',textEvidence:'지원하는 처리 키워드를 찾지 못함',luaEvidence:'그 외 처리는 검사 범위 밖',line:null};
  else{
    const callsWanted=mentioned.flatMap(x=>x.calls);
    const actionCall=calls.find(c=>callsWanted.includes(c.name));
    const setter=direct.find(c=>c.name.endsWith('.SetOperation'));
    const statement=mentioned.map(x=>x.label).join(' · ');
    if(actionCall&&setter)operation={stage:'효과 처리',status:'구조 발견',textEvidence:statement,luaEvidence:setter.name+' / '+actionCall.name+' · 호출 위치만 확인, 콜백 연결·동작 미검증',line:actionCall.line};
    else if(actionCall)operation={stage:'효과 처리',status:'판별 불가',textEvidence:statement,luaEvidence:actionCall.name+' 감지, 직접 SetOperation 연결은 미확인',line:actionCall.line};
    else if(uncertain)operation={stage:'효과 처리',status:'판별 불가',textEvidence:statement,luaEvidence:coverage+' · 다른 구현 경로 가능',line:null};
    else operation={stage:'효과 처리',status:'검토 필요',textEvidence:statement,luaEvidence:(setter?setter.name:'SetOperation 직접 연결 없음')+' · '+callsWanted.join('/')+' 직접 호출 미발견',line:setter?.line??null};
  }
  return {key:[input.card.themeId,input.card.passcode,src.assetId,fingerprint(src.hash+'|'+text.value)].join('::'),themeId:input.card.themeId,passcode:input.card.passcode,
    luaAssetId:src.assetId,filename:src.filename,sourceLabel:text.label,originalSnippet:compact(text.value,250),coverage,
    steps:[condition,cost,target,operation]};
}
function findingsOf(c:EffectAlignment,src:LuaAuditSource):AuditFinding[]{
  const rules:Record<AlignmentStage,string>={'발동 조건':'ALIGN_CONDITION_REVIEW','코스트':'ALIGN_COST_REVIEW','대상':'ALIGN_TARGET_REVIEW','효과 처리':'ALIGN_OPERATION_REVIEW'};
  return c.steps.filter(s=>s.status==='검토 필요').map(s=>({
    key:[c.key,rules[s.stage],fingerprint(s.luaEvidence)].join('::'),ruleId:rules[s.stage],severity:'검토',certainty:'정적 의심',themeId:c.themeId,passcode:c.passcode,
    title:s.stage+' · CDB/승인 원문과 Lua 연결 점검',evidence:compact(s.textEvidence+' / '+s.luaEvidence,220),
    suggestion:'효과 문구와 실제 효과 객체·콜백·헬퍼를 대조하세요. 정적 검사로 OCG 오류를 확정할 수 없습니다.',source:'Lua:'+src.assetId,line:s.line,
  }));
}
export function enrichReportWithAlignment(report:AuditReport,inputs:AuditInput[]):AuditReport{
  const comparisons:EffectAlignment[]=[],added:AuditFinding[]=[];
  for(const input of inputs)for(const src of input.lua){const c=compareCardEffect(input,src);comparisons.push(c);added.push(...findingsOf(c,src));}
  const priority={오류:0,주의:1,검토:2};
  const findings=[...report.findings,...added].sort((a,b)=>priority[a.severity]-priority[b.severity]||a.passcode.localeCompare(b.passcode,undefined,{numeric:true})||a.ruleId.localeCompare(b.ruleId));
  return {...report,engine:'P4.2-alignment-v1',comparisons,findings};
}