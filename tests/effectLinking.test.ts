import { describe, expect, it } from 'vitest';
import { mapNumberedEffects, splitNumberedEffects, enrichReportWithEffectLinks } from '../src/effectLinking';
import { analyzeBatch } from '../src/staticAnalyzer';
import { getParsedLua,clearLuaAstCache } from '../src/luaAstCache';
import type { AuditInput, LuaAuditSource } from '../src/staticAnalyzer';
import type { AssetEntry, IndexedCard } from '../src/fileCatalog';
const themeId='p43-test', cardId='91008601';
const source=(text:string,id='cdb-1'):IndexedCard=>({themeId,passcode:cardId,name:'번호 효과 테스트',effectText:text,sourceId:id,importedAt:'',confirmed:false});
const asset:AssetEntry={id:'lua-1',themeId,kind:'Lua',filename:'c91008601.lua',archivePath:'',cardId,sha256:'b'.repeat(64),size:100,importedAt:'',source:'직접',notes:[],cardCount:1};
const effectText='①: 덱에서 카드 1장을 패에 넣는다.\n②: 필드의 카드 1장을 파괴한다.';
const reverseLua=`local s,id=GetID()
function s.initial_effect(c)
 local e1=Effect.CreateEffect(c)
 e1:SetOperation(s.destroy)
 c:RegisterEffect(e1)
 local e2=Effect.CreateEffect(c)
 e2:SetOperation(s.add)
 c:RegisterEffect(e2)
end
function s.add(e,tp) Duel.SendtoHand(g,nil,REASON_EFFECT) end
function s.destroy(e,tp) Duel.Destroy(g,REASON_EFFECT) end`;
function input(lua=reverseLua,txt=effectText):AuditInput {
 return {card:{themeId,passcode:cardId,name:'번호 효과 테스트',conflictingSources:false,sourceCards:[source(txt)],files:[asset]},
   approvedEffect:'',lua:[{assetId:'lua-1',filename:'c91008601.lua',hash:'b'.repeat(64),content:lua,truncated:false}]};
}
const code=(x:AuditInput):LuaAuditSource=>x.lua[0];

describe('P4.3 numbered effects and registration graph',()=>{
 it('splits one-line and multiline numbered texts without treating HOPT preamble ①의 as a heading',()=>{
   const x=splitNumberedEffects('이 카드명의 ①의 효과는 1턴에 1번.\n①: 패에 넣는다. ②: 파괴한다.');
   expect(x.parts.map(p=>p.number)).toEqual(['①','②']);
   expect(x.warning.join(' ')).toContain('공통 효과');
   expect(splitNumberedEffects('①: 패에 넣는다.\n② 파괴한다.').parts).toHaveLength(2);
 });
 it('matches reverse Lua e2→① and e1→② through unique callback action evidence, not variable names',()=>{
   const x=input(),original=JSON.stringify(x);
   const result=mapNumberedEffects(x,code(x));
   expect(result.effects).toHaveLength(2);
   expect(result.effects.map(e=>[e.number,e.luaVariable,e.status])).toEqual([
     ['①','e2','고유 처리 근거 후보'],['②','e1','고유 처리 근거 후보'],
   ]);
   expect(result.effects[0].operationCallback).toBe('s.add');
   expect(result.effects[1].operationCallback).toBe('s.destroy');
   expect(result.unassignedLua).toHaveLength(0);
   expect(JSON.stringify(x)).toBe(original);
 });
 it('recognizes a cost callback for the correct mapped numbered effect',()=>{
   const lua=reverseLua.replace(' e2:SetOperation(s.add)',' e2:SetCost(s.cost)\n e2:SetOperation(s.add)')+'\nfunction s.cost(e,tp) return true end';
   const data=input(lua,'①: 패에서 카드 1장을 버리고 발동할 수 있다. 덱에서 카드 1장을 패에 넣는다.\n②: 필드의 카드 1장을 파괴한다.');
   const result=mapNumberedEffects(data,code(data));
   expect(result.effects[0].luaVariable).toBe('e2');
   expect(result.effects[0].steps.find(x=>x.stage==='코스트')?.status).toBe('구조 발견');
 });
 it('creates a numbered review candidate when an unambiguous mapped cost is missing',()=>{
   const data=input(reverseLua,'①: 패에서 카드 1장을 버리고 발동할 수 있다. 덱에서 카드 1장을 패에 넣는다.\n②: 필드의 카드 1장을 파괴한다.');
   const mapped=enrichReportWithEffectLinks(analyzeBatch([data],themeId,1),[data]);
   expect(mapped.engine).toBe('P4.3-effect-link-v1');
   expect(mapped.findings.some(f=>f.ruleId==='EFFECT_STAGE_REVIEW'&&f.title.includes('①')&&f.title.includes('코스트'))).toBe(true);
   expect(mapped.findings.find(f=>f.ruleId==='EFFECT_STAGE_REVIEW')?.certainty).toBe('정적 의심');
 });
 it('does not attach both search effects to the first matching Lua callback',()=>{
   const data=input(reverseLua.replace('Duel.Destroy(g,REASON_EFFECT)','Duel.SendtoHand(g,nil,REASON_EFFECT)'),
     '①: 덱에서 카드 1장을 패에 넣는다.\n②: 묘지의 카드 1장을 패에 넣는다.');
   const result=mapNumberedEffects(data,code(data));
   expect(result.effects.every(e=>e.status==='판별 불가'&&e.luaVariable===null)).toBe(true);
   expect(result.unassignedLua).toHaveLength(2);
 });
 it('does not auto-match a clone, even when one side seems unique',()=>{
   const data=input('local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n e1:SetOperation(s.add)\n c:RegisterEffect(e1)\n local e2=e1:Clone()\n c:RegisterEffect(e2)\nend\nfunction s.add(e,tp) Duel.SendtoHand(g,nil,REASON_EFFECT) end',
      '①: 카드 1장을 패에 넣는다.\n②: 묘지의 카드를 파괴한다.');
   const result=mapNumberedEffects(data,code(data));
   expect(result.effects.every(e=>e.luaVariable===null)).toBe(true);
   expect(result.warning.join(' ')).toContain('Clone()');
 });
 it('withholds matching when multiple Lua originals or unresolved helper usage exist',()=>{
   const data=input();data.lua.push({...data.lua[0],assetId:'lua-2'});
   expect(mapNumberedEffects(data,code(data)).effects.every(e=>!e.luaVariable)).toBe(true);
   const aux=input(reverseLua.replace(' e2:SetOperation(s.add)',' aux.AddLinkProcedure(c)\n e2:SetOperation(s.add)'));
   expect(mapNumberedEffects(aux,code(aux)).effects.every(e=>!e.luaVariable)).toBe(true);
 });
 it('avoids choosing one of two conflicting CDB originals without an approved benchmark',()=>{
   const data=input();data.card.sourceCards.push(source('①: 완전히 다른 효과다.','cdb-2'));
   const result=mapNumberedEffects(data,code(data));
   expect(result.effects).toHaveLength(0);
   expect(result.coverage).toContain('서로 다른 CDB 원문');
   data.approvedEffect=effectText;
   expect(mapNumberedEffects(data,code(data)).sourceLabel).toBe('승인 효과 원문');
 });
 it('returns unknown on unreadable, truncated or unparsable Lua instead of inventing effects',()=>{
   const data=input();data.lua[0].unavailable=true;
   expect(mapNumberedEffects(data,code(data)).effects.every(e=>e.status==='판별 불가')).toBe(true);
   data.lua[0].unavailable=false;data.lua[0].truncated=true;
   expect(mapNumberedEffects(data,code(data)).effects.every(e=>e.status==='판별 불가')).toBe(true);
   data.lua[0].truncated=false;data.lua[0].content='function s.initial_effect(c) if true then';
   expect(mapNumberedEffects(data,code(data)).effects.every(e=>!e.luaVariable)).toBe(true);
 });
 it('single effect and one registered object yields a weak, explicit candidate only',()=>{
   const data=input('local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n c:RegisterEffect(e1)\nend', '①: 이 카드의 공격력을 올린다.');
   const result=mapNumberedEffects(data,code(data));
   expect(result.effects[0].status).toBe('단일 구조 후보');
   expect(result.effects[0].actionEvidence).toContain('의미 일치는 확인하지 못함');
 });
 it('limits retained AST cache and reuses same source object without content mutation',()=>{
   clearLuaAstCache();const data=input();const a=getParsedLua(code(data)),b=getParsedLua(code(data));
   expect(a).toBe(b);
   const extra=Array.from({length:5},(_,i)=>({...code(data),assetId:'other-'+i,hash:String(i)}));
   for(const script of extra)expect(getParsedLua(script).ok).toBe(true);
   expect(getParsedLua(code(data)).ok).toBe(true);
   clearLuaAstCache();
 });
});