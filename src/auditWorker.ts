/// <reference lib="webworker" />
import { analyzeBatch } from './staticAnalyzer';
import { enrichReportWithAst } from './luaAstAnalyzer';
import { enrichReportWithAlignment } from './effectAlignment';
import type { AuditInput, AuditReport } from './staticAnalyzer';
const ctx=self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage=(event: MessageEvent<{requestId:string;inputs:AuditInput[];themeId:string;totalCards:number;scope:'카드'|'테마'}>)=>{
  const {requestId,inputs,themeId,totalCards,scope}=event.data;
  try {const report:AuditReport=enrichReportWithAlignment(enrichReportWithAst(analyzeBatch(inputs,themeId,totalCards,scope),inputs),inputs);ctx.postMessage({requestId,report});}
  catch (error){ctx.postMessage({requestId,error:error instanceof Error?error.message:'정적 분석 오류'});}
};