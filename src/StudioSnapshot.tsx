import {useRef,useState,type ChangeEvent} from 'react';
import {ArchiveRestore,CheckCircle2,Download,FileArchive,Info,ShieldCheck,Upload} from 'lucide-react';
import {
  createSnapshot,inspectSnapshot,previewRestore,restoreMissingOnly,
  type DatasetId,type PackedSnapshot,type RestorePreview
} from './studioSnapshot';
import './studio-snapshot.css';

const formatSize=(n:number)=>n<1048576?(n/1024).toFixed(1)+' KiB':(n/1048576).toFixed(1)+' MiB';
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function download(blob:Blob,name:string){
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export default function StudioSnapshot(){
  const input=useRef<HTMLInputElement|null>(null);
  const staged=useRef<PackedSnapshot|null>(null);
  const [preview,setPreview]=useState<RestorePreview|null>(null);
  const [chosen,setChosen]=useState<DatasetId[]>([]);
  const [busy,setBusy]=useState(false);
  const [info,setInfo]=useState('');
  const [error,setError]=useState('');
  const [lastExport,setLastExport]=useState('');
  const exportSnapshot=async()=>{
    if(busy)return;setBusy(true);setInfo('');setError('');
    try{
      const {file,manifest}=await createSnapshot();
      download(file,'YGO_STUDIO_통합작업실_백업_'+date()+'.zip');
      setLastExport(manifest.records.length+'건 · '+manifest.blobs.length+'개 바이너리 · '+formatSize(file.size));
      setInfo('백업 ZIP 다운로드를 시작했습니다. 파일을 PC에 안전하게 보관하고 복원 테스트까지 확인하세요.');
    }catch(e){setError('백업 실패: '+String(e));}
    finally{setBusy(false);}
  };
  const selectFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';
    if(!file||busy)return;
    setBusy(true);setInfo('');setError('');setPreview(null);staged.current=null;setChosen([]);
    try{
      if(!file.name.toLowerCase().endsWith('.zip'))throw Error('YGO STUDIO ZIP 백업을 선택하세요.');
      const packed=await inspectSnapshot(file);
      const result=await previewRestore(packed);
      staged.current=packed;setPreview(result);
      setChosen(result.byDataset.filter(x=>x.missing>0).map(x=>x.id));
      setInfo('SHA-256 및 데이터 형식 확인 완료. 아래 결과를 검토한 다음 복원할 항목을 선택하세요.');
    }catch(err){setError('백업 파일 검사 실패: '+String(err));}
    finally{setBusy(false);}
  };
  const restore=async()=>{
    if(busy||!staged.current||!preview||chosen.length===0)return;
    const total=preview.byDataset.filter(x=>chosen.includes(x.id)).reduce((n,x)=>n+x.missing,0);
    if(!total){setInfo('추가할 신규 저장 데이터가 없습니다. 기존 데이터는 그대로 보존했습니다.');return;}
    if(!window.confirm('선택한 작업실의 신규 '+total+'건만 복원할까요?\n이미 존재하는 저장 키는 덮어쓰지 않습니다. 진행 후 작업실을 새로고침해야 할 수 있습니다.'))return;
    setBusy(true);setInfo('');setError('');
    try{
      const result=await restoreMissingOnly(staged.current,chosen);
      setInfo('신규 '+result.added+'건 복원 · 기존 '+result.skipped+'건 보존. 복원된 작업실을 새로 열거나 새로고침해서 실제 데이터를 확인하세요.');
      if(result.failed.length)setError('일부 항목 복원 실패(' +result.failed.length+'건): '+result.failed.slice(0,5).join(' | '));
      setPreview(await previewRestore(staged.current));
    }catch(err){setError('복원 작업 실패: '+String(err));}
    finally{setBusy(false);}
  };
  const toggle=(id:DatasetId,on:boolean)=>setChosen(x=>on?[...x.filter(k=>k!==id),id]:x.filter(k=>k!==id));
  return <section className="snapshot-section" aria-label="V2.7 통합 작업실 백업·복원">
    <div className="snapshot-head">
      <div><span>V2.7 / INTEGRATED WORKSPACE BACKUP</span><h2>통합 작업실 백업·복원</h2>
        <p>현재 YGO STUDIO에 저장된 카드·일러스트·프레임·덱·관제 기록을 SHA-256 ZIP으로 보관합니다.</p></div>
      <span className="snapshot-protection"><ShieldCheck size={16}/> 읽기 전용 백업 · 기존 기록 보호</span>
    </div>
    <div className="snapshot-actions">
      <button type="button" className="snapshot-primary" onClick={()=>void exportSnapshot()} disabled={busy}><Download size={17}/> 현재 통합 자료 ZIP 다운로드</button>
      <button type="button" onClick={()=>input.current?.click()} disabled={busy}><Upload size={17}/> 통합 백업 ZIP 검사·복원</button>
      <input ref={input} type="file" hidden accept=".zip,application/zip" aria-label="YGO STUDIO 통합 백업 ZIP" onChange={e=>void selectFile(e)}/>
    </div>
    {!!lastExport&&<p className="snapshot-meta"><CheckCircle2 size={15}/> 마지막 ZIP: {lastExport}</p>}
    <div className="snapshot-disclaimer" role="note"><Info size={17}/>
      <p>현재 <strong>github.io 출처</strong>에 저장된 작업 자료만 포함합니다. 로컬 DUELMIND(127.0.0.1), 구형 독립 사이트, 원본 보관함의 대용량 파일, PC의 CDB·Lua·EDOPro 설치본은 별도 백업이 필요합니다. 이미지 연구소에서 아직 다운로드하지 않은 생성 캔버스는 포함되지 않습니다. ZIP은 암호화되지 않으므로 외부에 공개하지 마세요.</p>
    </div>
    {!!info&&<p className="snapshot-message" role="status">{info}</p>}
    {!!error&&<p className="snapshot-error" role="alert">{error}</p>}
    {preview&&<div className="snapshot-restore" aria-label="복원 미리보기">
      <div className="snapshot-restore-title"><FileArchive size={17}/><strong>복원 미리보기</strong>
        <span>신규 {preview.missing}건 · 기존 보존 {preview.existing}건</span></div>
      <div className="snapshot-rows">{preview.byDataset.map(x=><label key={x.id} className="snapshot-row">
        <input type="checkbox" checked={chosen.includes(x.id)} disabled={x.missing===0||busy} onChange={e=>toggle(x.id,e.target.checked)}/>
        <span>{x.label}</span>
        <span>신규 {x.missing} / 기존 {x.existing}</span>
      </label>)}</div>
      <p>기본 모드는 <strong>없는 항목만 추가</strong>야. 같은 카드 프로젝트·리소스팩·세션·덱이 이미 있으면 기존 내용을 덮어쓰지 않아. 충돌이 있는 자료는 해당 작업실에서 별도 검토해야 해.</p>
      <button className="snapshot-primary" type="button" disabled={busy||chosen.length===0} onClick={()=>void restore()}><ArchiveRestore size={16}/> 선택한 신규 데이터만 복원</button>
    </div>}
  </section>;
}
