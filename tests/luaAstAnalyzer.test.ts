import { describe, expect, it } from 'vitest';
import { inspectLuaAst, enrichReportWithAst } from '../src/luaAstAnalyzer';
import { analyzeBatch } from '../src/staticAnalyzer';
import type { AuditInput, LuaAuditSource } from '../src/staticAnalyzer';
import type { AssetEntry, IndexedCard } from '../src/fileCatalog';

const id='91008601', themeId='test-ast';
const codeSource=(text:string):IndexedCard=>({themeId,passcode:id,sourceId:'cdb-a',importedAt:'',effectText:text,name:'테스트 카드',confirmed:false});
const asset=(hash:string):AssetEntry=>({id:hash,themeId,kind:'Lua',filename:'c'+id+'.lua',archivePath:'',cardId:id,
  sha256:hash,size:100,importedAt:'',source:'직접',notes:[],cardCount:1});
function input(luaText:string,effect='①: 패에서 이 카드를 특수 소환한다.'):AuditInput {
  return {card:{themeId,passcode:id,name:'테스트 카드',conflictingSources:false,
    sourceCards:[codeSource(effect)],files:[asset('asset-a')]},
    approvedEffect:'',lua:[{assetId:'asset-a',filename:'c'+id+'.lua',hash:'a'.repeat(64),content:luaText,truncated:false}]};
}
const src=(v:AuditInput):LuaAuditSource=>v.lua[0];

describe('P4.1 Lua AST structural inspection',()=>{
  it('correct syntax with callbacks and registration generates no unresolved reference or parsing warning',()=>{
    const data=input('local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n e1:SetTarget(s.target)\n c:RegisterEffect(e1)\nend\nfunction s.target(e,tp) return true end');
    const f=inspectLuaAst(data,src(data));
    expect(f.some(x=>['AST_PARSE_REVIEW','AST_CALLBACK_UNRESOLVED','AST_EFFECT_REGISTRATION_REVIEW'].includes(x.ruleId))).toBe(false);
  });
  it('misnamed global initial_effect yields a source-offset patch, without changing source input',()=>{
    const script='function c123456.initial_effect(c)\nend';
    const data=input(script),before=JSON.stringify(data);
    const f=inspectLuaAst(data,src(data)).find(x=>x.ruleId==='AST_NAMESPACE_MISMATCH');
    expect(f?.patch?.before).toBe('c123456');
    expect(f?.patch?.after).toBe('c'+id);
    expect(f?.patch?.sourceHash).toBe('a'.repeat(64));
    expect(script.slice(f!.patch!.start,f!.patch!.end)).toBe('c123456');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('count limit suggestion only when HOPT and a recognized GetID alias exist',()=>{
    const script='local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n e1:SetCountLimit(1)\n c:RegisterEffect(e1)\nend';
    const data=input(script,'이 카드명의 ①의 효과는 1턴에 1번밖에 사용할 수 없다.');
    const patch=inspectLuaAst(data,src(data)).find(f=>f.ruleId==='AST_COUNT_LIMIT_CANDIDATE')?.patch;
    expect(patch?.before).toContain('SetCountLimit(1)');
    expect(patch?.after).toContain('SetCountLimit(1,id)');
    const derived=script.slice(0,patch!.start)+patch!.after+script.slice(patch!.end);
    expect(derived).toContain('SetCountLimit(1,id)');
    expect(script).not.toContain('SetCountLimit(1,id)');
    const noHopt=input(script,'1턴에 1번 발동할 수 있다.');
    expect(inspectLuaAst(noHopt,src(noHopt)).some(f=>f.ruleId==='AST_COUNT_LIMIT_CANDIDATE')).toBe(false);
  });
  it('unresolved callback is flagged as a review, while properly defined callback is not',()=>{
    const missing=input('local s,id=GetID()\nfunction s.initial_effect(c)\n local e1=Effect.CreateEffect(c)\n e1:SetOperation(s.op)\n c:RegisterEffect(e1)\nend');
    const result=inspectLuaAst(missing,src(missing));
    expect(result.find(f=>f.ruleId==='AST_CALLBACK_UNRESOLVED')?.certainty).toBe('정적 의심');
    const fixed=input(missing.lua[0].content+'\nfunction s.op(e,tp) return true end');
    expect(inspectLuaAst(fixed,src(fixed)).some(f=>f.ruleId==='AST_CALLBACK_UNRESOLVED')).toBe(false);
  });
  it('malformed or unsupported Lua is a parser-review candidate, never an OCG error certification',()=>{
    const data=input('local s,id=GetID()\nfunction s.initial_effect(c)\n if true then');
    const f=inspectLuaAst(data,src(data));
    expect(f.some(x=>x.ruleId==='AST_PARSE_REVIEW'&&x.certainty==='정적 의심'&&x.patch===undefined)).toBe(true);
  });
  it('unavailable or truncated originals do not generate speculative patches',()=>{
    const data=input('function c123456.initial_effect(c) end');
    data.lua[0].truncated=true;
    expect(inspectLuaAst(data,src(data))).toEqual([]);
    data.lua[0].truncated=false;data.lua[0].unavailable=true;
    expect(inspectLuaAst(data,src(data))).toEqual([]);
  });
  it('worker report enrichment preserves P4 findings and marks AST engine without mutating originals',()=>{
    const data=input('function c123456.initial_effect(c) end');
    const initial=analyzeBatch([data],themeId,1);
    const before=JSON.stringify(initial);
    const updated=enrichReportWithAst(initial,[data]);
    expect(updated.engine).toBe('P4.1-ast-v1');
    expect(updated.findings.some(f=>f.ruleId==='AST_NAMESPACE_MISMATCH')).toBe(true);
    expect(JSON.stringify(initial)).toBe(before);
  });
});
