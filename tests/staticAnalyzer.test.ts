import { describe,it,expect } from 'vitest';
import { analyzeCard, analyzeBatch } from '../src/staticAnalyzer';
import type { AuditInput, LuaAuditSource } from '../src/staticAnalyzer';
import type { IndexedCard, AssetEntry } from '../src/fileCatalog';
const code='91008601',themeId='test-theme';
const source=(text:string,name='예시 카드',sourceId='source-a'):IndexedCard=>({themeId,passcode:code,sourceId,importedAt:'',effectText:text,name,confirmed:false});
const asset=(kind:AssetEntry['kind'],hash='hash-a',filename=kind==='Lua'?`c${code}.lua`:'cards.cdb'):AssetEntry=>({id:hash,themeId,kind,filename,archivePath:'',cardId:kind==='CDB'?null:code,sha256:hash,size:100,importedAt:'',source:'직접',notes:[],cardCount:1});
const lua=(content:string,truncated=false,hash='hash-a'):LuaAuditSource=>({assetId:hash,filename:`c${code}.lua`,hash,content,truncated});
const base=(effect='①: 이 카드를 패에 넣는다.'):AuditInput=>({card:{themeId,passcode:code,name:'예시 카드',conflictingSources:false,sourceCards:[source(effect)],files:[asset('CDB','source-a'),asset('Lua')]},approvedEffect:'',lua:[lua('local s,id=GetID()\nfunction s.initial_effect(c)\nlocal e1=Effect.CreateEffect(c)\nc:RegisterEffect(e1)\nend')]});
describe('P4: evidence-based static analyzer',()=>{
 it('different CDB texts for same ID are recorded as source conflicts, not approved effects',()=>{
   const input=base();input.card.sourceCards.push(source('②: 다르게 발동한다.','예시 카드','source-b'));input.card.conflictingSources=true;
   const result=analyzeCard(input);
   expect(result.find(x=>x.ruleId==='CDB_CONFLICT')?.certainty).toBe('자료 확인');
   expect(result.some(x=>x.title.includes('OCG 위반 확정'))).toBe(false);
 });
 it('identical CDB and approved text with whitespace changes produce no divergence',()=>{
   const input=base('①: 이 카드가 소환되었을 경우에 발동한다.');
   input.approvedEffect='①: 이 카드가  소환되었을 경우에\n 발동한다.';
   expect(analyzeCard(input).some(f=>f.ruleId==='APPROVED_CDB_DIFF')).toBe(false);
   input.approvedEffect='②: 텍스트가 다르다.';
   expect(analyzeCard(input).some(f=>f.ruleId==='APPROVED_CDB_DIFF')).toBe(true);
 });
 it('Lua initial_effect with other ID is a source fact with line and trace',()=>{
   const input=base();input.lua=[lua(`local s,id=GetID()\nfunction c98765.initial_effect(c)\nend`)];
   const item=analyzeCard(input).find(f=>f.ruleId==='LUA_ID_MISMATCH');
   expect(item?.severity).toBe('오류');expect(item?.line).toBe(2);expect(item?.source).toContain('Lua:');
 });
 it('Lua without initial_effect is flagged only for complete scans and nonempty effect text',()=>{
   const input=base();input.lua=[lua('function s.foo(c)\nend')];
   expect(analyzeCard(input).some(f=>f.ruleId==='LUA_INITIAL_EFFECT')).toBe(true);
   input.lua=[lua('function s.foo(c)\nend',true)];
   expect(analyzeCard(input).some(f=>f.ruleId==='LUA_INITIAL_EFFECT')).toBe(false);
   expect(analyzeCard(input).some(f=>f.ruleId==='LUA_TRUNCATED')).toBe(true);
 });
 it('count limit and targeting are recommendations, not confirmed rules violations',()=>{
   const input=base('이 카드명의 ①의 효과는 1턴에 1번밖에 사용할 수 없다. 대상 몬스터를 대상으로 하고 발동할 수 있다.');
   input.lua=[lua('local s,id=GetID()\nfunction s.initial_effect(c)\nend')];
   const result=analyzeCard(input);
   expect(result.find(f=>f.ruleId==='COUNT_LIMIT_REVIEW')?.certainty).toBe('정적 의심');
   expect(result.find(f=>f.ruleId==='TARGET_FLAG_REVIEW')?.severity).toBe('검토');
   input.lua=[lua('function s.initial_effect(c)\ne1:SetCountLimit(1,id)\ne1:SetProperty(EFFECT_FLAG_CARD_TARGET)\nend')];
   expect(analyzeCard(input).some(f=>['COUNT_LIMIT_REVIEW','COUNT_LIMIT_PER_COPY','TARGET_FLAG_REVIEW'].includes(f.ruleId))).toBe(false);
 });
 it('script missing, CDB missing and duplicate Lua versions are separately labeled',()=>{
   const input=base();input.lua=[];input.card.files=[asset('CDB','source-a')];
   expect(analyzeCard(input).some(f=>f.ruleId==='MISSING_LUA')).toBe(true);
   input.card.sourceCards=[];input.card.files=[asset('Lua','hash-a'),asset('Lua','hash-b')];
   expect(analyzeCard(input).some(f=>f.ruleId==='LUA_VARIANTS')).toBe(true);
   expect(analyzeCard(input).some(f=>f.ruleId==='MISSING_CDB')).toBe(true);
 });
 it('missing local effect callback is a heuristic, commented functions do not count',()=>{
   const input=base();input.lua=[lua(`local s,id=GetID()\nfunction s.initial_effect(c)\n-- function s.search(e,tp) end\ne1:SetTarget(s.search)\nend`)];
   expect(analyzeCard(input).some(f=>f.ruleId==='MISSING_LOCAL_CALLBACK')).toBe(true);
 });
 it('finding keys are stable and content-dependent, without changing source data',()=>{
   const input=base(),before=JSON.stringify(input);
   const a=analyzeCard(input),b=analyzeCard(input);
   expect(a.map(f=>f.key)).toEqual(b.map(f=>f.key));expect(JSON.stringify(input)).toBe(before);
 });
 it('batch report indicates partial coverage and never claims EDOPro verification',()=>{
   const report=analyzeBatch([base()],themeId,501);
   expect(report.scannedCards).toBe(1);expect(report.truncated).toBe(true);
   expect(report.engine).toBe('P4-static-v1');
 });
});