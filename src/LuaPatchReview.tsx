import { useState } from 'react';
import { Check, Download, FileDiff, ShieldAlert } from 'lucide-react';
import { getOriginal } from './fileVault';
import { recordAuditDecision } from './auditDecisions';
import type { AuditDecision } from './auditDecisions';
import type { AuditFinding } from './staticAnalyzer';
import './lua-patch-review.css';

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');

type Preview = { original: string; revised: string; proposedHash: string };
/** Reviewable, immutable-by-default suggestion. Never writes to the uploaded source. */
export default function LuaPatchReview({ finding, onRecorded }:
  { finding:AuditFinding; onRecorded:(event:AuditDecision)=>void }) {
  const patch = finding.patch;
  const [preview,setPreview] = useState<Preview|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  if (!patch) return null;

  const read = async (): Promise<Preview> => {
    const blob = await getOriginal(patch.assetId);
    if(blob.size>128*1024) throw new Error('원본이 정밀 분석 제한을 초과했습니다. 자동 제안을 내보내지 않습니다.');
    const binary = await blob.arrayBuffer();
    const hash = toHex(await crypto.subtle.digest('SHA-256',binary));
    if(hash.toLowerCase()!==patch.sourceHash.toLowerCase())
      throw new Error('업로드 원본 해시가 분석 당시와 다릅니다. 분석을 다시 실행하세요.');
    const original = new TextDecoder('utf-8').decode(binary);
    if(original.slice(patch.start,patch.end)!==patch.before)
      throw new Error('수정 위치의 원문이 달라졌습니다. 수정안을 취소하고 다시 분석하세요.');
    const revised = original.slice(0,patch.start) + patch.after + original.slice(patch.end);
    const encoded = new TextEncoder().encode(revised);
    const buffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(buffer).set(encoded);
    const proposedHash = toHex(await crypto.subtle.digest('SHA-256',buffer));
    return {original,revised,proposedHash};
  };

  const open = async () => {
    setBusy(true);setError('');setMessage('');
    try {setPreview(await read());}
    catch(e){setPreview(null);setError(e instanceof Error?e.message:'수정안 확인 실패');}
    finally{setBusy(false);}
  };

  const approveExport = async () => {
    if(!preview||busy)return;
    const note = window.prompt('이 수정안의 승인 근거를 작성하세요. 원본 Lua를 변경하거나 EDOPro 검증을 완료하지는 않습니다.');
    if(note===null)return;
    if(!note.trim()){setError('수정안 내보내기에는 근거가 필요합니다.');return;}
    if(!window.confirm('수정안을 별도 Lua 파일로 내보냅니다. 원본은 보존되고, 실제 적용·테스트는 별도로 해야 합니다. 계속할까요?'))return;
    setBusy(true);setError('');
    try{
      const now = await read();
      if(now.proposedHash!==preview.proposedHash)throw new Error('비교한 수정안이 더 이상 일치하지 않습니다.');
      const event=await recordAuditDecision({
        key:finding.key,themeId:finding.themeId,passcode:finding.passcode,
        status:'수정안 내보내기 승인(수동)',note:note.trim(),
        patch:{assetId:patch.assetId,sourceHash:patch.sourceHash,filename:patch.filename,
          start:patch.start,end:patch.end,before:patch.before,after:patch.after,proposedHash:now.proposedHash},
      });
      onRecorded(event);
      const blob=new Blob([now.revised],{type:'text/plain;charset=utf-8'});
      const href=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=href;
      anchor.download='검토안_c'+finding.passcode+'.lua';anchor.click();
      window.setTimeout(()=>URL.revokeObjectURL(href),3000);
      setMessage('수동 승인 이력 저장 후 별도 검토안 파일을 내보냈어. EDOPro 구현 상태는 변경되지 않았어.');
    }catch(e){setError(e instanceof Error?e.message:'수정안 승인·내보내기 실패');}
    finally{setBusy(false);}
  };

  return <div className="lua-patch">
    <button type="button" className="outline-button" onClick={()=>void open()} disabled={busy}>
      <FileDiff size={14}/> {busy?'원본 확인 중':'수정 전후 비교'}
    </button>
    {error&&<p role="alert" className="lua-patch-error">{error}</p>}
    {preview&&<div className="lua-patch-details">
      <div className="lua-patch-details-head"><strong>미승인 Lua 수정 제안</strong>
        <span>{patch.filename} · SHA256 {patch.sourceHash.slice(0,12)}…</span></div>
      <p><ShieldAlert size={14}/> {patch.reason} 이 패치는 분석기 제안이며 실행 검증을 거치지 않았어.</p>
      <div className="lua-patch-diff"><div><small>기존 원문</small><pre>{patch.before}</pre></div>
        <div><small>수정 후보</small><pre>{patch.after}</pre></div></div>
      <button type="button" className="primary-button" disabled={busy} onClick={()=>void approveExport()}>
        <Check size={14}/> 근거 입력·수동 승인 후 별도 파일 내보내기 <Download size={14}/>
      </button>
      <small>원본 CDB·Lua·승인 효과를 수정하지 않아. 검토안은 EDOPro용 최종 스크립트가 아니야.</small>
    </div>}
    {message&&<p className="lua-patch-message" role="status">{message}</p>}
  </div>;
}
