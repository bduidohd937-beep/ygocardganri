import { useEffect,useMemo,useRef,useState } from 'react';
import { AlertTriangle,Download,Save,Trash2 } from 'lucide-react';
import type { DeckStudy } from './deckMath';
import type { CombinationMetrics } from './combinationMath';
import { assessDuelHand,DUEL_OUTCOMES,parseHand,reportedSummary,SHUFFLE_MODES,snapshotSha256,validateHand,validateEvidenceBackup } from './duelEvidence';
import type { DuelEvidenceRecord,DuelOutcome,ReplayEvidence,ShuffleMode } from './duelEvidence';
import { getReplayEvidence,listDuelEvidence,removeDuelEvidence,storeDuelEvidence } from './duelEvidenceVault';
import './test-lab.css';

type Props={study:DeckStudy;dirty:boolean;handSize:5|6};
const pct=(p:number|null)=>p===null?'표본 없음':(p*100).toFixed(1)+'%';
const digest=async(blob:Blob)=>{
  const buffer=await blob.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
function download(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export default function TestLab({study,dirty,handSize}:Props){
  const [records,setRecords]=useState<DuelEvidenceRecord[]>([]);
  const [fingerprint,setFingerprint]=useState('');
  const [handInput,setHandInput]=useState('');
  const [mode,setMode]=useState<ShuffleMode>('추출 방식 미확인');
  const [outcome,setOutcome]=useState<DuelOutcome>('판정 보류');
  const [note,setNote]=useState('');
  const [replay,setReplay]=useState<File|null>(null);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [theory,setTheory]=useState<{hash:string;hand:5|6;value:number|null}|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let alive=true;
    setFingerprint('');setRecords([]);
    if(study.revision<1)return;
    void Promise.all([snapshotSha256(study),listDuelEvidence(study.id)])
      .then(([hash,data])=>{if(alive){setFingerprint(hash);setRecords(data);}})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'테스트 기록 조회 실패');});
    return()=>{alive=false;};
  },[study.id,study.revision,study.main,study.extra,study.side,study.combinations]);

  useEffect(()=>{
    if(!fingerprint||!study.combinations?.routes.length)return;
    const worker=new Worker(new URL('./combinationWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(e:MessageEvent<{current?:CombinationMetrics;error?:string}>)=>{
      if(e.data.current)setTheory({hash:fingerprint,hand:handSize,value:e.data.current.anyRoute});
      else if(e.data.error)setError(e.data.error);
    };
    worker.onerror=()=>setError('이론 확률 계산용 Worker 실행 실패');
    worker.postMessage({main:study.main,sourceMain:study.main,plan:study.combinations,hand:handSize});
    return()=>worker.terminate();
  },[fingerprint,handSize,study.main,study.combinations]);

  const stats=useMemo(()=>reportedSummary(records,study,fingerprint,handSize),[records,study,fingerprint,handSize]);
  const visibleTheory=theory?.hash===fingerprint&&theory.hand===handSize?theory.value:null;
  const canSave=study.revision>0&&!dirty&&!busy&&Boolean(fingerprint);
  const submit=async()=>{
    if(!canSave)return;
    setBusy(true);setError('');setStatus('');
    try{
      const hand=parseHand(handInput);
      validateHand(study.main,hand,handSize);
      let attachment:ReplayEvidence|undefined;
      if(replay){
        const lower=replay.name.toLowerCase();
        if(!lower.endsWith('.yrpx')&&!lower.endsWith('.yrp'))throw new Error('EDOPro 리플레이 .yrpX 또는 .yrp 파일만 첨부할 수 있습니다.');
        if(replay.size<1||replay.size>16*1024*1024)throw new Error('리플레이 파일은 최대 16MiB까지 저장할 수 있습니다.');
        attachment={filename:replay.name.slice(0,180),size:replay.size,
          sha256:await digest(replay),format:lower.endsWith('.yrpx')?'yrpX':'yrp'};
      }
      const checked=await snapshotSha256(study);
      if(checked!==fingerprint)throw new Error('덱 설정이 변경되었습니다. 연구안을 다시 열어 주세요.');
      const event:DuelEvidenceRecord={
        schemaVersion:1,id:crypto.randomUUID(),studyId:study.id,studyRevision:study.revision,
        deckFingerprint:fingerprint,themeId:study.themeId,recordedAt:new Date().toISOString(),
        handSize,hand,shuffleMode:mode,outcome,note:note.trim().slice(0,1500),
        assessment:assessDuelHand(hand,study.combinations||{routes:[],brickIds:[]}),
        ...(attachment?{replay:attachment}:{}),
      };
      await storeDuelEvidence(event,replay);
      setRecords(old=>[event,...old]);setHandInput('');setNote('');setReplay(null);
      if(fileRef.current)fileRef.current.value='';
      setStatus('사용자 판정과 리플레이 해시를 저장했어. EDOPro 재생 결과는 자동 검증하지 않았어.');
    }catch(e){setError(e instanceof Error?e.message:'기록 저장 실패');}
    finally{setBusy(false);}
  };
  const remove=async(record:DuelEvidenceRecord)=>{
    if(!window.confirm('이 시험 기록과 첨부 리플레이를 브라우저에서 삭제할까요?'))return;
    setBusy(true);setError('');
    try{await removeDuelEvidence(record.id);setRecords(old=>old.filter(r=>r.id!==record.id));
      setStatus('시험 기록만 삭제했어. YDK/CDB/Lua는 보존돼.');}
    catch(e){setError(e instanceof Error?e.message:'기록 삭제 실패');}
    finally{setBusy(false);}
  };
  const saveReplay=async(record:DuelEvidenceRecord)=>{
    if(!record.replay)return;
    setBusy(true);setError('');
    try{
      const blob=await getReplayEvidence(record);
      if(await digest(blob)!==record.replay.sha256)throw new Error('저장된 리플레이 SHA256이 일치하지 않습니다.');
      download(blob,record.replay.filename);
    }catch(e){setError(e instanceof Error?e.message:'리플레이 읽기 실패');}
    finally{setBusy(false);}
  };
  const backup=()=>{
    const data={kind:'ygo_card_studio_edopro_evidence',schemaVersion:1,
      exportedAt:new Date().toISOString(),records} as const;
    if(!validateEvidenceBackup(data)){setError('기록 형식이 올바르지 않습니다.');return;}
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}),
      'EDOPro_테스트기록_'+study.id.slice(0,8)+'.json');
    setStatus('JSON은 메타데이터 백업이야. 리플레이 파일 자체는 포함되지 않아.');
  };
  return <section className="testlab" aria-label="EDOPro 실전 검증 기록">
    <header className="testlab-head"><div><span className="micro-label">P6 / REPLAY EVIDENCE · TEST LAB</span>
      <h3>EDOPro 실전 검증 기록</h3>
      <p>실제 플레이한 첫 패와 성공·실패를 기록한 뒤 이론상 패 조건과 대조해. 실측 결과는 <strong>사용자 판정</strong>으로만 저장돼.</p></div></header>
    <div className="testlab-guide">
      <strong>진행 방법</strong>
      <span>① 위의 분석안 YDK 출력 → EDOPro 덱 편집기에 넣고 Test Hand 또는 듀얼 실행</span>
      <span>② 첫 패 카드 ID, 추출 방식, 전개 결과 기록 → 리플레이가 있다면 첨부</span>
      <span>③ 기록된 덱 해시와 버전에 맞춰 이론 확률과 수동 결과 비교</span>
    </div>
    <p className="testlab-disclaimer"><AlertTriangle size={15}/> .yrpX 파일을 보관하고 SHA256을 계산하지만 내용·엔진 실행 여부는 해석하지 않아. 의도적으로 만든 테스트 패를 무작위 통계에 포함하지 않아.</p>
    {dirty&&<p role="status" className="testlab-warning">덱 연구안을 먼저 저장해야 현재 설정으로 테스트 기록을 남길 수 있어.</p>}
    {!study.revision&&<p className="testlab-warning">연구안을 한 번 저장한 뒤 실전 테스트 기록을 추가할 수 있어.</p>}
    <div className="testlab-inputs">
      <label className="testlab-span">첫 패 카드 ID ({handSize}장)
        <textarea aria-label="EDOPro 첫 패 카드 ID" value={handInput} rows={2}
          onChange={e=>setHandInput(e.target.value)} placeholder="예: 91008601, 91008602, 91008603, 91008604, 91008605"/></label>
      <label>패 추출 방식
        <select aria-label="EDOPro 추출 방식" value={mode} onChange={e=>setMode(e.target.value as ShuffleMode)}>
          {SHUFFLE_MODES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>플레이 결과 (사용자 판정)
        <select aria-label="EDOPro 결과" value={outcome} onChange={e=>setOutcome(e.target.value as DuelOutcome)}>
          {DUEL_OUTCOMES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="testlab-span">리플레이 첨부 (선택, 16MiB 이하)
        <input ref={fileRef} aria-label="EDOPro 리플레이 파일" type="file" accept=".yrpx,.yrp"
          onChange={e=>setReplay(e.target.files?.[0]||null)}/>
        <small>{replay?replay.name:'리플레이는 브라우저에만 저장해. 최신 형식 .yrpX 권장.'}</small></label>
      <label className="testlab-span">전개 근거·실패 원인
        <textarea aria-label="EDOPro 실험 메모" value={note} rows={2} maxLength={1500}
          onChange={e=>setNote(e.target.value)} placeholder="예: 이론상 초동이지만 실제 소환 제약으로 전개 실패"/></label>
    </div>
    <div className="testlab-actions">
      <button type="button" className="primary-button" disabled={!canSave} onClick={()=>void submit()}>
        <Save size={14}/> 테스트 기록 저장</button>
      <button type="button" className="outline-button" disabled={!records.length} onClick={backup}>
        <Download size={14}/> 기록 JSON 백업</button>
      <small>연구안 리비전 {study.revision} · SHA256 {fingerprint?fingerprint.slice(0,12)+'…':'준비 중'}</small>
    </div>
    {error&&<p role="alert" className="testlab-error">{error}</p>}
    {status&&<p role="status" className="testlab-success">{status}</p>}
    <div className="testlab-stats">
      <div><span>이론상 초동 패 조건</span><strong>{visibleTheory===null?'미설정/계산 불가':pct(visibleTheory)}</strong></div>
      <div><span>무작위 패 실측 성공 (사용자 보고)</span><strong>{pct(stats.rate)}</strong></div>
      <div><span>무작위 완료 기록</span><strong>{stats.randomCompleted}건</strong></div>
      <div><span>패 조건과 사용자 판정 불일치</span><strong>{stats.mismatched}/{stats.modelCompared}건</strong></div>
    </div>
    <p className="testlab-note">동일한 연구안 버전·해시·패 {handSize}장이며 무작위 셔플로 표시된 성공/실패 기록만 비율에 포함해. 무작위성·독립성·결과의 진실성은 확인하지 못하므로 승률이나 통계적 신뢰구간으로 해석하지 않아.</p>
    <div className="testlab-list-heading"><h4>실험 기록 {records.length}건</h4><small>다른 덱 버전은 현재 통계에서 자동 제외</small></div>
    <div className="testlab-list">
      {records.length===0?<p className="testlab-empty">아직 EDOPro 실험 기록이 없어.</p>:
       records.map(record=><article className="testlab-entry" key={record.id}>
         <div className="testlab-entry-heading"><strong>{record.outcome}</strong><small>{new Date(record.recordedAt).toLocaleString('ko-KR')}</small>
          <em>{record.studyRevision===study.revision&&record.deckFingerprint===fingerprint?'현재 덱 버전':'다른 덱 버전 · 통계 제외'}</em></div>
         <p>{record.shuffleMode} · {record.handSize}장 · {record.hand.join(', ')}</p>
         <p>이론상 루트: {record.assessment.eligible===null?'미설정':record.assessment.eligible?'충족':'미충족'} · 리플레이: {record.replay?'파일 첨부(미해석)':'없음'}</p>
         {record.note&&<p>관찰 메모: {record.note}</p>}
         {record.replay&&<p className="testlab-hash">{record.replay.filename} · SHA256 {record.replay.sha256.slice(0,16)}…</p>}
         <div className="testlab-entry-actions">
           {record.replay&&<button type="button" className="outline-button" disabled={busy}
             onClick={()=>void saveReplay(record)}><Download size={13}/> 리플레이 받기</button>}
           <button type="button" className="outline-button" disabled={busy} onClick={()=>void remove(record)}>
             <Trash2 size={13}/> 기록 삭제</button>
         </div>
       </article>)}
    </div>
    <p className="testlab-note">이 기능은 EDOPro 프로세스를 자동 실행하지 않아. 사용자 입력과 리플레이 파일 해시를 모아 검수하는 첫 연동 단계이며, 엔진 자동화 및 리플레이 해독은 후속 작업이야.</p>
  </section>;
}
