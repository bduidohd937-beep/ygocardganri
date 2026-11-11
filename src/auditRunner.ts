/** P4: file originals are read on demand, never executed; report is read-only. */
import { collectLinkedCards } from './importedWorkbench';
import { cardRecordKey } from './importedWorkbench';
import { loadCatalog, getOriginal } from './fileVault';
import { loadAllImportedRecords } from './workbenchVault';
import type { AuditInput, AuditReport, LuaAuditSource } from './staticAnalyzer';

export const MAX_AUDIT_CARDS=200;
const MAX_LUA_TEXT=128*1024;
export type AuditProgress={processed:number;total:number;filename:string};
export async function runStaticAudit(themeId:string,passcode:string|null,signal:AbortSignal,onProgress:(p:AuditProgress)=>void):Promise<AuditReport>{
  if(signal.aborted)throw new DOMException('분석 취소','AbortError');
  const catalog=await loadCatalog();
  const allCards=collectLinkedCards(catalog,themeId).filter(c=>!passcode||c.passcode===passcode);
  if(!catalog.themes.some(t=>t.id===themeId))throw new Error('존재하지 않는 테마입니다.');
  const cards=allCards.slice(0,MAX_AUDIT_CARDS);
  const records=await loadAllImportedRecords();
  const recordByKey=new Map(records.filter(r=>r.themeId===themeId).map(r=>[cardRecordKey(r.themeId,r.passcode),r]));
  const inputs:AuditInput[]=[];
  const total=cards.length;
  for(let i=0;i<cards.length;i++){
    if(signal.aborted)throw new DOMException('분석 취소','AbortError');
    const card=cards[i];const lua:LuaAuditSource[]=[];
    const scripts=card.files.filter(f=>f.kind==='Lua').slice(0,3);
    for(const asset of scripts){
      if(signal.aborted)throw new DOMException('분석 취소','AbortError');
      onProgress({processed:i,total,filename:asset.filename});
      try{
        const blob=await getOriginal(asset.id);
        lua.push({assetId:asset.id,filename:asset.filename,hash:asset.sha256,content:await blob.slice(0,MAX_LUA_TEXT).text(),truncated:blob.size>MAX_LUA_TEXT});
      }catch{
        // Missing binary is a separate evidence problem; preserve identity and report as truncated/incomplete.
        lua.push({assetId:asset.id,filename:asset.filename,hash:asset.sha256,content:'',truncated:false,unavailable:true});
      }
    }
    inputs.push({card,approvedEffect:recordByKey.get(cardRecordKey(themeId,card.passcode))?.approvedEffect||'',lua});
    onProgress({processed:i+1,total,filename:card.name});
    if(i%10===9)await new Promise<void>(r=>setTimeout(r,0));
  }
  if(signal.aborted)throw new DOMException('분석 취소','AbortError');
  const worker=new Worker(new URL('./auditWorker.ts',import.meta.url),{type:'module'});
  return await new Promise<AuditReport>((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    let settled=false;
    const cleanup=()=>{if(settled)return;settled=true;worker.terminate();signal.removeEventListener('abort',onAbort);};
    const onAbort=()=>{cleanup();reject(new DOMException('분석 취소','AbortError'));};
    if(signal.aborted){onAbort();return;}
    signal.addEventListener('abort',onAbort,{once:true});
    worker.onmessage=(event:MessageEvent<{requestId:string;report?:AuditReport;error?:string}>)=>{
      if(event.data.requestId!==requestId)return;
      cleanup();if(event.data.report)resolve(event.data.report);else reject(new Error(event.data.error||'분석 실패'));
    };
    worker.onerror=()=>{cleanup();reject(new Error('분석 Worker 처리 실패'));};
    worker.postMessage({requestId,inputs,themeId,totalCards:allCards.length,scope:passcode?'카드':'테마'});
  });
}