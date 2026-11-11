/// <reference lib="webworker" />
import { analyzeBatch } from './staticAnalyzer';
import { enrichReportWithAst } from './luaAstAnalyzer';
import { enrichReportWithAlignment } from './effectAlignment';
import { enrichReportWithEffectLinks } from './effectLinking';
import { clearLuaAstCache } from './luaAstCache';
import type { AuditInput, AuditReport, AuditFinding } from './staticAnalyzer';
import type { EffectAlignment } from './effectAlignment';
import type { EffectLinkReport } from './effectLinking';
const ctx=self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage=(event: MessageEvent<{requestId:string;inputs:AuditInput[];themeId:string;totalCards:number;scope:'카드'|'테마'}>)=>{
  const {requestId,inputs,themeId,totalCards,scope}=event.data;
  try {
    const baseline=analyzeBatch(inputs,themeId,totalCards,scope);
    const findings:AuditFinding[]=[...baseline.findings];
    const comparisons:EffectAlignment[]=[];
    const effectLinks:EffectLinkReport[]=[];
    // Processing a card at a time allows P4.1, P4.2 and P4.3 to share each Lua AST.
    // Immediately release the cache after each card to avoid retaining ASTs for 200 cards.
    for(const input of inputs){
      try {
        const blank:AuditReport={...baseline,findings:[]};
        findings.push(...enrichReportWithAst(blank,[input]).findings);
        const alignment=enrichReportWithAlignment(blank,[input]);
        findings.push(...alignment.findings);
        comparisons.push(...(alignment.comparisons||[]));
        const linked=enrichReportWithEffectLinks(blank,[input]);
        findings.push(...linked.findings);
        effectLinks.push(...(linked.effectLinks||[]));
      } finally {clearLuaAstCache();}
    }
    const priority={오류:0,주의:1,검토:2};
    findings.sort((a,b)=>priority[a.severity]-priority[b.severity]||
      a.passcode.localeCompare(b.passcode,undefined,{numeric:true})||a.ruleId.localeCompare(b.ruleId));
    const report:AuditReport={...baseline,engine:'P4.3-effect-link-v1',findings,comparisons,effectLinks};
    ctx.postMessage({requestId,report});
  } catch(error) {
    clearLuaAstCache();
    ctx.postMessage({requestId,error:error instanceof Error?error.message:'정적 분석 오류'});
  }
};