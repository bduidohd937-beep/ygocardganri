import { useEffect,useRef,useState } from 'react';
import { Download,Trash2 } from 'lucide-react';
import type { DeckStudy } from './deckMath';
import { inspectArenaExport,sha256Blob } from './arenaIntake';
import type { ArenaIntakeRecord } from './arenaIntake';
import { addArenaIntake,arenaIntakeId,getArenaIntakeFile,listArenaIntake,removeArenaIntake } from './arenaIntakeVault';
import { snapshotSha256 } from './duelEvidence';
import ArenaSessionReview from './ArenaSessionReview';
import './arena-intake.css';

type Props={study:DeckStudy;dirty:boolean;fingerprint:string};
const safeFilename=(name:string)=>name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,180);
function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=safeFilename(name);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export default function ArenaIntake({study,dirty,fingerprint}:Props){
  const [records,setRecords]=useState<ArenaIntakeRecord[]>([]);
  const [error,setError]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [reviewId,setReviewId]=useState('');
  const picker=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let alive=true;setRecords([]);setError('');setReviewId('');
    void listArenaIntake(study.id).then(data=>{if(alive)setRecords(data);})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'수집함 조회 실패');});
    return()=>{alive=false;};
  },[study.id]);

  const canImport=Boolean(fingerprint)&&study.revision>=1&&!dirty&&!busy;
  const upload=async(file:File|null)=>{
    if(!file||!canImport)return;
    setBusy(true);setError('');setStatus('');
    try{
      const {format,preview,sha256}=await inspectArenaExport(file);
      const current=await snapshotSha256(study);
      if(current!==fingerprint)throw new Error('분석안 내용이 변경됐습니다. 저장 후 다시 가져오세요.');
      const record:ArenaIntakeRecord={
        schemaVersion:1,id:arenaIntakeId(study.id,study.revision,fingerprint,sha256),
        studyId:study.id,studyRevision:study.revision,deckFingerprint:fingerprint,
        importedAt:new Date().toISOString(),filename:file.name,size:file.size,sha256,format,preview,
        verification:'원본 파일 보관 · 내용 미검증',
      };
      const added=await addArenaIntake(record,file);
      setRecords(await listArenaIntake(study.id));
      setStatus(added?'원본 수집 완료. 실제 경기 수·승패·초동 패는 아직 검증하지 않았습니다.':'같은 분석안·같은 파일 해시가 이미 보관되어 중복 저장하지 않았습니다.');
    }catch(e){setError(e instanceof Error?e.message:'로컬 내보내기 파일 수집 실패');}
    finally{setBusy(false);if(picker.current)picker.current.value='';}
  };
  const get=async(rec:ArenaIntakeRecord)=>{
    if(busy)return;
    setBusy(true);setError('');setStatus('');
    try{
      const blob=await getArenaIntakeFile(rec.id);
      if(blob.size!==rec.size||await sha256Blob(blob)!==rec.sha256)
        throw new Error('저장된 파일의 SHA256 또는 크기가 원본 기록과 다릅니다. 다운로드를 중단했습니다.');
      download(blob,rec.filename);
      setStatus('SHA256 일치 확인 후 원본 파일을 다운로드했습니다. 엔진 실행 내용은 별도 검증이 필요합니다.');
    }catch(e){setError(e instanceof Error?e.message:'원본 파일 다운로드 실패');}
    finally{setBusy(false);}
  };
  const remove=async(rec:ArenaIntakeRecord)=>{
    if(busy||!window.confirm('이 수집 기록과 파일 사본을 삭제할까요? 원본 외부 파일은 변경되지 않습니다.'))return;
    setBusy(true);setError('');setStatus('');
    try{await removeArenaIntake(rec.id);setRecords(await listArenaIntake(study.id));
      if(reviewId===rec.id)setReviewId('');
      setStatus('수집함 사본만 삭제했습니다. P5/P6와 원본 YDK·CDB·Lua는 변경하지 않았습니다.');}
    catch(e){setError(e instanceof Error?e.message:'수집 기록 삭제 실패');}
    finally{setBusy(false);}
  };
  return <section className="arena-intake" aria-label="PSH AI ARENA 결과 파일 수집함">
    <div className="arena-intake-head">
      <span className="micro-label">P6.1 / LOCAL EXPORT INTAKE</span>
      <h4>PSH AI ARENA 결과 파일 수집함</h4>
      <p>로컬 경기장에서 내보낸 JSON·CSV·ZIP을 선택해 원본을 별도로 보관하고 SHA256을 확인해. 현재 V2.4 출력 스키마가 검증되지 않아 경기 수·승패·전개 성공률은 자동 계산하지 않아.</p>
    </div>
    <div className="arena-intake-actions">
      <label>로컬 내보내기 파일 (최대 16MiB)
        <input ref={picker} type="file" accept=".json,.csv,.zip" aria-label="PSH AI ARENA 내보내기 파일"
          disabled={!canImport} onChange={e=>void upload(e.target.files?.[0]||null)}/>
      </label>
      <small>{dirty?'먼저 연구안을 저장하세요.':!fingerprint?'저장된 연구안 지문을 읽는 중…':'JSON 구조·CSV 헤더·ZIP 파일 목록만 확인합니다.'}</small>
    </div>
    {error&&<p className="testlab-error" role="alert">{error}</p>}
    {status&&<p className="testlab-success" role="status">{status}</p>}
    <div className="testlab-list-heading"><h4>보관된 로컬 내보내기 {records.length}건</h4><small>검증되지 않은 외부 파일 · P6 실측 통계 제외</small></div>
    <div className="testlab-list">
      {records.length===0?<p className="testlab-empty">아직 보관된 경기장 출력 파일이 없습니다.</p>:
       records.map(rec=><article className="testlab-entry" key={rec.id}>
         <div className="testlab-entry-heading">
           <strong>{rec.filename}</strong>
           <small>{rec.format.toUpperCase()} · {rec.size.toLocaleString('ko-KR')}바이트 · {new Date(rec.importedAt).toLocaleString('ko-KR')}</small>
           <em>{rec.studyRevision===study.revision&&rec.deckFingerprint===fingerprint?'현재 연구안과 연결':'다른 연구안 버전 · 통계 제외'}</em>
         </div>
         <p>상태: {rec.verification} · {rec.preview.structure} · 항목/행 수 {rec.preview.itemCount===null?'미확인':rec.preview.itemCount}</p>
         {rec.preview.fields.length>0&&<p>감지한 키/헤더/파일명: {rec.preview.fields.join(' · ')}</p>}
         {rec.preview.notes.map((n,i)=><p key={i}>{n}</p>)}
         <p className="testlab-hash">SHA256 {rec.sha256}</p>
         <div className="testlab-entry-actions">
           {rec.format!=='zip'&&<button type="button" className="outline-button" disabled={busy}
             onClick={()=>setReviewId(current=>current===rec.id?'':rec.id)}>
             {reviewId===rec.id?'세션 검수 닫기':'세션 결과 검수'}</button>}
           <button type="button" className="outline-button" disabled={busy} onClick={()=>void get(rec)}>
             <Download size={13}/> 원본 받기 (해시 확인)</button>
           <button type="button" className="outline-button" disabled={busy} onClick={()=>void remove(rec)}>
             <Trash2 size={13}/> 수집 사본 삭제</button>
         </div>
       </article>)}
    </div>
    <ArenaSessionReview record={records.find(rec=>rec.id===reviewId)||null}
      study={study} dirty={dirty} fingerprint={fingerprint}/>
    <p className="testlab-note">이는 사용자가 선택한 파일의 **구조 검사·보관** 단계입니다. ZIP 내부 파일은 압축 해제하지 않으며, 파일 이름과 SHA256만으로 EDOPro 실행·무작위 셔플·듀얼 완료를 인증할 수 없습니다. 실제 스키마 확인 후 P6.1 후속 어댑터에서 결과를 대조합니다.</p>
  </section>;
}
