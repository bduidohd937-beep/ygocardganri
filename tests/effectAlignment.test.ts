import { describe,expect,it } from 'vitest';
import { compareCardEffect,enrichReportWithAlignment } from '../src/effectAlignment';
import { analyzeBatch } from '../src/staticAnalyzer';
import type { AuditInput, LuaAuditSource } from '../src/staticAnalyzer';
import type { IndexedCard, AssetEntry } from '../src/fileCatalog';

const themeId='cosmocode-test',id='91008601';
const cdb=(text:string,sourceId='cdb-a'):IndexedCard=>({themeId,passcode:id,name:'원본 검수 카드',effectText:text,sourceId,importedAt:'',confirmed:false});
const asset=(name='c91008601.lua'):AssetEntry=>({id:'lua-a',themeId,kind:'Lua',filename:name,archivePath:'',cardId:id,sha256:'a'.repeat(64),size:100,importedAt:'',source:'직접',notes:[],cardCount:1});
const text='이 카드가 소환되었을 경우에 발동할 수 있다. ①: 패에서 카드 1장을 버리고 발동할 수 있다. 필드의 몬스터 1장을 대상으로 하고 발동할 수 있다. 덱에서 카드 1장을 패에 넣는다.';
const fullScript=`local s,id=GetID()
function s.initial_effect(c)
 local e1=Effect.CreateEffect(c)
 e1:SetCondition(s.cond)
 e1:SetCost(s.cost)
 e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
 e1:SetTarget(s.target)
 e1:SetOperation(s.operation)
 c:RegisterEffect(e1)
end
function s.cond(e,tp) return true end
function s.cost(e,tp) return true end
function s.target(e,tp) return true end
function s.operation(e,tp) Duel.SendtoHand(g,nil,REASON_EFFECT) end`;
function input(luaText=fullScript,sourceText=text):AuditInput{
  return {card:{themeId,passcode:id,name:'원본 검수 카드',conflictingSources:false,sourceCards:[cdb(sourceText)],files:[asset()]},
    approvedEffect:'',lua:[{assetId:'lua-a',filename:'c91008601.lua',hash:'a'.repeat(64),content:luaText,truncated:false}]};
}
const code=(input:AuditInput):LuaAuditSource=>input.lua[0];
const stage=(v:AuditInput,name:'발동 조건'|'코스트'|'대상'|'효과 처리')=>compareCardEffect(v,code(v)).steps.find(s=>s.stage===name)!;

describe('P4.2 CDB text to Lua AST comparison',()=>{
 it('recognizes direct per-stage structure without falsely certifying effects',()=>{
   const data=input();const result=compareCardEffect(data,code(data));
   expect(result.steps.map(s=>s.status)).toEqual(['구조 발견','구조 발견','구조 발견','구조 발견']);
   expect(result.steps.find(s=>s.stage==='코스트')?.luaEvidence).toContain('SetCost');
   expect(result.steps.find(s=>s.stage==='효과 처리')?.luaEvidence).toContain('Duel.SendtoHand');
   expect(result.coverage).toContain('실제 효과 의미는 미검증');
 });
 it('finds missing direct cost, target, and operation only as review candidates',()=>{
   const data=input('function s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n c:RegisterEffect(e1)\nend');
   expect(stage(data,'코스트').status).toBe('검토 필요');
   expect(stage(data,'대상').status).toBe('검토 필요');
   expect(stage(data,'효과 처리').status).toBe('검토 필요');
   const report=enrichReportWithAlignment(analyzeBatch([data],themeId,1),[data]);
   expect(report.findings.filter(x=>x.ruleId.startsWith('ALIGN_')).every(x=>x.certainty==='정적 의심'&&x.severity==='검토')).toBe(true);
 });
 it('recognizes SetCode/SetType triggers without incorrectly flagging absent SetCondition',()=>{
   const data=input('function s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n e1:SetType(EFFECT_TYPE_TRIGGER_O)\n e1:SetCode(EVENT_SUMMON_SUCCESS)\n c:RegisterEffect(e1)\nend');
   expect(stage(data,'발동 조건').status).toBe('판별 불가');
 });
 it('withholds missing-method accusations when multiple numbered effects or registrations exist',()=>{
   const data=input('function s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n local e2=Effect.CreateEffect(c)\n c:RegisterEffect(e1)\n c:RegisterEffect(e2)\nend',text+' ②: 다른 카드를 패에 넣는다.');
   expect(stage(data,'코스트').status).toBe('판별 불가');
   expect(stage(data,'대상').status).toBe('판별 불가');
   expect(stage(data,'효과 처리').status).toBe('판별 불가');
 });
 it('does not compare conflicting CDB originals without approved source',()=>{
   const data=input();data.card.sourceCards.push(cdb('②: 다른 효과를 가진다.','cdb-b'));
   const result=compareCardEffect(data,code(data));
   expect(result.coverage).toContain('비교 기준을 선택할 수 없습니다');
   expect(result.steps.every(x=>x.status==='판별 불가')).toBe(true);
 });
 it('uses approved text as benchmark without changing any CDB source',()=>{
   const data=input();data.approvedEffect='이 효과는 1턴에 1번 발동할 수 있다.';
   const before=JSON.stringify(data);const result=compareCardEffect(data,code(data));
   expect(result.sourceLabel).toContain('승인 효과 원문');
   expect(result.steps.every(s=>s.status==='문구 없음')).toBe(true);
   expect(JSON.stringify(data)).toBe(before);
 });
 it('recognizes missing targeting flag as review, not a confirmed rule violation',()=>{
   const data=input(fullScript.replace(' e1:SetProperty(EFFECT_FLAG_CARD_TARGET)\n',''));
   expect(stage(data,'대상').status).toBe('검토 필요');
 });
 it('treats external helpers and incomplete Lua as unknown',()=>{
   const withHelper=input('function s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n aux.AddRitualProcedure(c)\n c:RegisterEffect(e1)\nend');
   expect(stage(withHelper,'코스트').status).toBe('판별 불가');
   const incomplete=input();incomplete.lua[0].truncated=true;
   expect(compareCardEffect(incomplete,code(incomplete)).steps.every(s=>s.status==='판별 불가')).toBe(true);
   const broken=input('function s.initial_effect(c) if true then');
   expect(compareCardEffect(broken,code(broken)).steps.every(s=>s.status==='판별 불가')).toBe(true);
 });
 it('conserves existing findings and labels no OCG or EDOPro automatic success',()=>{
   const data=input();const original=analyzeBatch([data],themeId,1),old=JSON.stringify(original);
   const result=enrichReportWithAlignment(original,[data]);
   expect(result.engine).toBe('P4.2-alignment-v1');
   expect(result.comparisons?.length).toBe(1);
   expect(JSON.stringify(original)).toBe(old);
   expect(JSON.stringify(data)).toBe(JSON.stringify(input()));
 });
});