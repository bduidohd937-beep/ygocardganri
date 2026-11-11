/** P4 manual triage is separate from all approved texts and implementation states. */
export type AuditTriageStatus='검토중'|'조치 필요'|'확인됨(수동)'|'오탐(수동)';
export type AuditDecision={key:string;themeId:string;passcode:string;status:AuditTriageStatus;note:string;at:string};
const DATABASE='ygo_card_studio_static_audit';
function openDB():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DATABASE,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('events'))req.result.createObjectStore('events',{autoIncrement:true});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
export async function getAuditDecisions(themeId:string):Promise<AuditDecision[]>{
  const db=await openDB();
  try{return await new Promise((resolve,reject)=>{
    const req=db.transaction('events','readonly').objectStore('events').getAll();
    req.onsuccess=()=>{
      const rows=req.result as AuditDecision[];
      resolve(rows.filter(row=>row.themeId===themeId&&typeof row.key==='string'&&typeof row.at==='string'));
    };req.onerror=()=>reject(req.error);
  });}finally{db.close();}
}
export async function recordAuditDecision(input:Omit<AuditDecision,'at'>):Promise<AuditDecision>{
  if(!input.key||!input.themeId||!input.passcode)throw new Error('검토 대상이 유효하지 않습니다.');
  if(!['검토중','조치 필요','확인됨(수동)','오탐(수동)'].includes(input.status))throw new Error('검토 상태가 유효하지 않습니다.');
  if(['확인됨(수동)','오탐(수동)'].includes(input.status)&&!input.note.trim())throw new Error('확인·오탐 판정에는 근거 메모가 필요합니다.');
  const decision={...input,note:input.note.trim().slice(0,2000),at:new Date().toISOString()};
  const db=await openDB();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('events','readwrite');tx.objectStore('events').add(decision);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });return decision;}finally{db.close();}
}
export function latestDecisions(history:AuditDecision[]):Map<string,AuditDecision>{
  const result=new Map<string,AuditDecision>();for(const row of history)result.set(row.key,row);return result;
}