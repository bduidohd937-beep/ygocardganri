import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Clock3, Database, Download, FileCode2, FileImage, FileQuestion, FileText, FolderOpen, History, Plus, Save, ShieldCheck } from 'lucide-react';
import { APPROVAL_OPTIONS, BALANCE_OPTIONS, ENGINE_OPTIONS, RULE_OPTIONS } from './data';
import type { AssetEntry, FileCatalog } from './fileCatalog';
import { collectLinkedCards } from './importedWorkbench';
import type { CardReview, ImportedRecord, ReviewField } from './importedWorkbench';
import { addImportedProposal, decideImportedProposal, editImportedRecord, setReview } from './importedWorkbench';
import { getOriginal, loadCatalog } from './fileVault';
import { loadImportedRecord, saveImportedRecord } from './workbenchVault';
import './imported-studio.css';

type Props={themeId:string;passcode:string;onBack:()=>void};
type Tab='effect'|'files'|'history';
const reviewGroups: {field:ReviewField; label:string; choices:readonly string[]}[] = [
  {field:'designStatus',label:'설계 종합 승인',choices:APPROVAL_OPTIONS},
  {field:'artStatus',label:'일러스트 승인',choices:APPROVAL_OPTIONS},
  {field:'ocg',label:'OCG 규칙 검수',choices:RULE_OPTIONS},
  {field:'balance',label:'밸런스 검토',choices:BALANCE_OPTIONS},
  {field:'cdb',label:'CDB 구현 검수',choices:ENGINE_OPTIONS},
  {field:'lua',label:'Lua 스크립트 검수',choices:ENGINE_OPTIONS},
  {field:'duel',label:'EDOPro 실전 테스트',choices:ENGINE_OPTIONS},
];
const dateText=(value:string)=>value?new Date(value).toLocaleString('ko-KR'):'미확인';
const SIZE=(s:number)=>s>1048576?`${(s/1048576).toFixed(2)} MB`:`${(s/1024).toFixed(1)} KB`;

function useOriginalPreview(asset:AssetEntry|undefined,kind:'image'|'lua'){
  const [preview,setPreview]=useState<string>('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let live=true,objectUrl='';setPreview('');setError('');
    if(!asset)return;
    void getOriginal(asset.id).then(async blob=>{
      if(!live)return;
      if(kind==='image'){
        objectUrl=URL.createObjectURL(blob);setPreview(objectUrl);
      }else{
        const text=await blob.slice(0,100_000).text();if(live)setPreview(text+(blob.size>100_000?'\n\n[이하 생략: 최대 100KB 미리보기]':''));
      }
    }).catch(e=>{if(live)setError(e instanceof Error?e.message:'원본 불러오기 실패');});
    return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[asset?.id,kind]);
  return {preview,error};
}

export default function ImportedCardStudio({themeId,passcode,onBack}:Props){
  const [catalog,setCatalog]=useState<FileCatalog|null>(null);
  const [record,setRecord]=useState<ImportedRecord|null>(null);
  const [loadingError,setLoadingError]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const writeLock=useRef(false);
  const [tab,setTab]=useState<Tab>('effect');
  const [editMode,setEditMode]=useState(false);
  const [metaDraft,setMetaDraft]=useState({workingName:'',design:'',notes:''});
  const [proposalText,setProposalText]=useState('');
  const [proposalNote,setProposalNote]=useState('');
  const [proposalSource,setProposalSource]=useState<string>('manual');
  const [imageId,setImageId]=useState('');
  const [luaId,setLuaId]=useState('');
  const [historyLimit,setHistoryLimit]=useState(30);
  useEffect(()=>{
    let active=true;
    setCatalog(null);setRecord(null);setError('');setLoadingError('');setImageId('');setLuaId('');
    Promise.all([loadCatalog(),loadImportedRecord(themeId,passcode)]).then(([c,r])=>{
      if(!active)return;
      setCatalog(c);setRecord(r);
    }).catch(e=>{if(active)setLoadingError(e instanceof Error?e.message:'작업실 로드 실패');});
    return()=>{active=false;};
  },[themeId,passcode]);
  const linked=useMemo(()=>catalog?collectLinkedCards(catalog,themeId).find(c=>c.passcode===passcode):undefined,[catalog,themeId,passcode]);
  const title=record?.workingName.trim() || linked?.name || '미확인';
  const sourceCards=linked?.sourceCards??[];
  const files=linked?.files??[];
  const imageFiles=files.filter(f=>f.kind==='이미지');
  const luaFiles=files.filter(f=>f.kind==='Lua');
  const chosenImage=imageFiles.find(a=>a.id===imageId)||imageFiles[0];
  const chosenLua=luaFiles.find(a=>a.id===luaId)||luaFiles[0];
  const image=useOriginalPreview(chosenImage,'image');
  const lua=useOriginalPreview(chosenLua,'lua');
  const themeName=catalog?.themes.find(t=>t.id===themeId)?.name||'미확인 테마';
  const update=useCallback(async(action:(r:ImportedRecord)=>ImportedRecord)=>{
    if(!record||writeLock.current)return false;
    writeLock.current=true;setSaving(true);setError('');
    try{
      const next=action(record);
      if(next===record)return true;
      await saveImportedRecord(next,record.revision);
      setRecord(next);return true;
    }catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다. 원본 자료는 변경되지 않았습니다.');return false;}
    finally{writeLock.current=false;setSaving(false);}
  },[record]);
  const saveMeta=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(await update(r=>editImportedRecord(r,metaDraft,'카드 작업 문서 수정')))setEditMode(false);
  };
  const sendProposal=async()=>{
    const found=sourceCards.find(s=>s.sourceId===proposalSource);
    const sourceId=found?.sourceId??null;
    if(await update(r=>addImportedProposal(r,proposalText,proposalNote,sourceId))){setProposalText('');setProposalNote('');setProposalSource('manual');}
  };
  const review=async(id:string,approve:boolean)=>{
    if(!record)return;
    const p=record.proposals.find(item=>item.id===id);if(!p)return;
    const message=approve?`이 효과안을 승인하고 현재 승인 원문을 교체할까요?\n\n[이전 승인 원문]\n${record.approvedEffect||'미확인'}\n\n[새 승인 원문]\n${p.text}`:'효과안을 반려하고 기록을 보존할까요?';
    if(!window.confirm(message))return;
    await update(r=>decideImportedProposal(r,id,approve?'승인':'반려'));
  };
  const setReviewStatus=async(field:ReviewField,value:string)=>{
    const current=record?.review[field];if(current===value)return;
    let note='';
    if(value==='승인'||value==='통과'||value==='검증완료'||value==='충돌 없음 확인'){
      const result=window.prompt(`${reviewGroups.find(g=>g.field===field)?.label}를 '${value}'(으)로 수동 변경합니다.\n근거 또는 테스트 결과를 입력하세요. (취소 시 변경 없음)`);
      if(result===null)return;
      if(!result.trim()){setError('승인·검증 완료 상태에는 근거를 반드시 입력해야 합니다.');return;}
      note=result.trim();
    }
    await update(r=>setReview(r,field,value as CardReview[ReviewField],note));
  };
  const download=async(file:AssetEntry)=>{
    try{
      const original=await getOriginal(file.id);const url=URL.createObjectURL(original);
      const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){setError(e instanceof Error?e.message:'파일 다운로드 실패');}
  };
  if(loadingError)return <section className="iw-root"><button className="outline-button" onClick={onBack}><ArrowLeft size={15}/> 카드 목록</button><div className="iw-alert" role="alert">{loadingError}</div></section>;
  if(!record||!catalog)return <div className="fc-initial">카드 연결 파일과 설계 문서 불러오는 중...</div>;
  return <section className="iw-root">
    <div className="studio-breadcrumb"><button onClick={onBack}><ArrowLeft size={15}/> 카드 라이브러리</button><span>/</span><strong>{themeName}</strong><span>/</span><strong>{passcode}</strong></div>
    <div className="studio-heading"><div><div className="page-eyebrow">IMPORTED CARD / {passcode}</div><h1>{title}</h1><div className="studio-meta"><span>작업 리비전 v{record.revision}</span><span>CDB 원본 {sourceCards.length}건</span><span>연결 파일 {files.length}개</span><span>효과 {record.approvedEffect?'승인 원문 있음':'미확인'}</span></div></div><button className="outline-button" onClick={()=>setTab('history')}><History size={16}/> 변경 이력</button></div>
    {error&&<div className="iw-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
    {linked?.conflictingSources&&<div className="iw-alert" role="status"><AlertTriangle size={16}/>같은 카드 ID에 서로 다른 CDB 이름 또는 효과가 등록되어 있어. 어느 쪽도 자동 승인되지 않았어. 아래 출처를 비교해서 선택해.</div>}
    <div className="iw-main-grid">
      <aside className="iw-left-panel">
        <div className="iw-illustration">{image.preview?<img src={image.preview} alt={`${title} 업로드 원본 일러스트 (미승인 가능)`}/>:<div className="iw-art-empty"><FileImage size={33}/><strong>카드 일러스트</strong><span>{chosenImage?'원본 확인 중':'첨부 없음 · 미확인'}</span></div>}</div>
        <div className="iw-file-caption">업로드 원본 미리보기 · 일러스트 승인 여부와 별개</div>
        {imageFiles.length>1&&<label className="iw-label">표시할 이미지 파일<select value={chosenImage?.id||''} onChange={e=>setImageId(e.target.value)}>{imageFiles.map(a=><option key={a.id} value={a.id}>{a.filename}</option>)}</select></label>}
        {image.error&&<small className="iw-error">{image.error}</small>}
        <div className="iw-metadata"><div><span>테마</span><strong>{themeName}</strong></div><div><span>카드 ID</span><code>{passcode}</code></div><div><span>승인 카드명</span><strong>미확인</strong></div><div><span>CDB 카드명</span><strong>{linked?.conflictingSources?'원본 간 불일치':linked?.name||'미확인'}</strong></div><div><span>문서명 (작업용)</span><strong>{record.workingName||'미설정'}</strong></div></div>
        <button className="outline-button iw-wide" onClick={()=>{setMetaDraft({workingName:record.workingName,design:record.design,notes:record.notes});setEditMode(v=>!v);setTab('effect');}}><FileText size={15}/> 설계 문서 편집</button>
        {editMode&&<form className="iw-meta-form" onSubmit={e=>void saveMeta(e)}><label>작업용 카드명<input value={metaDraft.workingName} onChange={e=>setMetaDraft({...metaDraft,workingName:e.target.value})} placeholder="승인 이름이 아닌 작업 제목"/></label><label>디자인 방향<textarea rows={3} value={metaDraft.design} onChange={e=>setMetaDraft({...metaDraft,design:e.target.value})}/></label><label>설계 메모<textarea rows={3} value={metaDraft.notes} onChange={e=>setMetaDraft({...metaDraft,notes:e.target.value})}/></label><button className="primary-button" disabled={saving} type="submit"><Save size={15}/> 문서 저장</button></form>}
        {!editMode&&record.design&&<div className="iw-notes"><small>디자인 방향</small><p>{record.design}</p></div>}
      </aside>
      <div className="iw-editor">
        <div className="tabline"><button className={tab==='effect'?'active':''} onClick={()=>setTab('effect')}>효과 · 설계</button><button className={tab==='files'?'active':''} onClick={()=>setTab('files')}>파일 · Lua</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>변경 이력</button></div>
        {tab==='effect'&&<>
          <section className="editor-module"><div className="module-heading"><div><span className="micro-label">APPROVED TEXT / HUMAN DECISION</span><h3>승인 효과 원문</h3></div><span className="module-version">v{record.revision}</span></div><pre className="iw-text iw-text--approved">{record.approvedEffect||'미확인 · 승인된 효과 원문이 없습니다.'}</pre><div className="module-foot"><ShieldCheck size={15}/><span>{record.approvedEffectSource||'원문 승인 근거: 미확인'}</span></div></section>
          <section className="editor-module"><div className="module-heading"><div><span className="micro-label">CDB EXTRACTED TEXT / NOT APPROVED</span><h3>CDB 원문 후보 ({sourceCards.length}건)</h3></div></div>
            {sourceCards.length?sourceCards.map((source,i)=>{const asset=catalog.assets.find(a=>a.id===source.sourceId);return <div className="iw-source" key={`${source.sourceId}-${i}`}><div className="iw-source-head"><strong>{source.name||'카드명 미확인'}</strong><small>{asset?.filename||'원본 파일 미확인'} · SHA {asset?.sha256.slice(0,12)||'미확인'}…</small></div><pre className="iw-text">{source.effectText||'효과 텍스트 없음'}</pre><button className="outline-button" disabled={!source.effectText} onClick={()=>{setProposalText(source.effectText);setProposalSource(source.sourceId);setProposalNote(`CDB 후보: ${asset?.filename||source.sourceId}`);}}>이 원문으로 미승인 제안 작성 <Plus size={14}/></button></div>;}):<p className="iw-empty">연결된 CDB 원문이 없어. 효과는 수동 제안으로 작성할 수 있어.</p>}
          </section>
          <section className="editor-module editor-module--proposal"><div className="module-heading"><div><span className="micro-label">PROPOSAL / REVIEW QUEUE</span><h3>새 효과 제안</h3></div><span className="iw-source-tag">승인 전 원문 변경 금지</span></div><label className="iw-label">효과 제안<textarea rows={7} value={proposalText} onChange={e=>{setProposalText(e.target.value);if(proposalSource!=='manual')setProposalSource('manual');}} placeholder="CDB 원문 후보를 선택하거나 직접 입력"/></label><label className="iw-label">검토 근거<input value={proposalNote} onChange={e=>setProposalNote(e.target.value)} placeholder="수정 의도 및 출처"/></label><div className="form-actions"><button className="primary-button" onClick={()=>void sendProposal()} disabled={!proposalText.trim()||saving}><Plus size={15}/> 미승인 제안 저장</button></div></section>
          {record.proposals.map(p=><section className="proposal-review" key={p.id}><div className="proposal-review-top"><span>제안 {dateText(p.createdAt)}</span><span className="iw-status">{p.status}</span></div>{p.sourceId&&<small>원본 CDB 파일 ID: {p.sourceId}</small>}<pre className="iw-text">{p.text}</pre>{p.note&&<p className="iw-sidenote">{p.note}</p>}{p.status==='미승인'&&<><div className="iw-diff"><div><strong>현재 승인 원문</strong><pre>{record.approvedEffect||'미확인'}</pre></div><div><strong>새 제안</strong><pre>{p.text}</pre></div></div><div className="form-actions"><button className="outline-button" disabled={saving} onClick={()=>void review(p.id,false)}>반려</button><button className="primary-button" disabled={saving} onClick={()=>void review(p.id,true)}><Check size={14}/> 명시 승인</button></div></>}</section>)}
        </>}
        {tab==='files'&&<>
          <section className="editor-module"><div className="module-heading"><div><span className="micro-label">LINKED ASSETS / CARD ID</span><h3>연결된 원본 {files.length}개</h3></div></div>
            {files.length?files.map(f=><div className="iw-file-row" key={f.id}><div><strong>{f.filename}</strong><small>{f.kind} · {SIZE(f.size)} · SHA256 {f.sha256.slice(0,14)}…</small><small>{f.source==='ZIP'?'ZIP 내부 파일':'직접 업로드'} · {dateText(f.importedAt)}</small></div><button className="outline-button" onClick={()=>void download(f)}><Download size={14}/> 원본</button></div>):<p className="iw-empty">매칭된 파일이 없어. 파일 센터에서 카드 ID를 확인해.</p>}
          </section>
          <section className="editor-module"><div className="module-heading"><div><span className="micro-label">LUA / STATIC PREVIEW ONLY</span><h3>Lua 스크립트 · {luaFiles.length}개</h3></div><FileCode2 size={17}/></div>
            {luaFiles.length>1&&<label className="iw-label">검토할 Lua 원본<select value={chosenLua?.id||''} onChange={e=>setLuaId(e.target.value)}>{luaFiles.map(f=><option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>}
            {lua.error&&<div className="iw-alert">{lua.error}</div>}
            <pre className="iw-code">{lua.preview||'Lua 원본 없음 · 검증 미확인'}</pre><div className="module-foot"><FileQuestion size={15}/><span>이 화면은 Lua를 실행하거나 엔진 결과를 검증하지 않습니다.</span></div>
          </section>
        </>}
        {tab==='history'&&<div className="editor-module"><div className="module-heading"><div><span className="micro-label">IMMUTABLE LOG / VERSIONS</span><h3>문서 변경 이력 {record.history.length}건</h3></div></div>
          {record.history.slice(0,historyLimit).map(h=><div className="iw-history-row" key={h.id}><div><Clock3 size={13}/>{dateText(h.at)} · v{h.revision} · {h.action}</div><strong>{h.field}</strong><p>이전: {h.before||'미확인'}</p><p>이후: {h.after||'미확인'}</p>{h.note&&<small>{h.note}</small>}</div>)}
          {!record.history.length&&<p className="iw-empty">변경 이력이 없어.</p>}
          {record.history.length>historyLimit&&<button className="outline-button" onClick={()=>setHistoryLimit(n=>n+30)}>이전 30건 더 보기 <ChevronDown size={14}/></button>}
        </div>}
      </div>
      <aside className="iw-inspector"><div className="inspector-title"><ShieldCheck size={18}/><strong>검수 · 구현 현황</strong></div><p>상태는 자동으로 통과 처리되지 않아. 검수한 결과만 수동 기록해.</p><div className="iw-review-list">{reviewGroups.map((row,i)=><label key={row.field} className="iw-review-row"><span>{row.label}</span><select aria-label={`${row.label} 상태`} value={record.review[row.field]} disabled={saving} onChange={e=>void setReviewStatus(row.field,e.target.value)}>{row.choices.map(ch=><option key={ch}>{ch}</option>)}</select>{i===1||i===3?<div className="inspector-divider"/>:null}</label>)}</div><div className="inspector-divider"/><div className="iw-inspector-summary"><FolderOpen size={17}/><strong>원본 파일 {files.length}개</strong></div><div className="iw-mini-stat"><span>CDB 후보</span><strong>{sourceCards.length}</strong></div><div className="iw-mini-stat"><span>Lua</span><strong>{luaFiles.length}</strong></div><div className="iw-mini-stat"><span>이미지</span><strong>{imageFiles.length}</strong></div><div className="iw-mini-stat"><span>제안 대기</span><strong>{record.proposals.filter(p=>p.status==='미승인').length}</strong></div><button className="outline-button iw-wide" onClick={()=>setTab('files')}><Database size={14}/> 파일·코드 확인</button><p className="iw-sidenote">원본 파일은 기존 저장소에 그대로 보관돼. 여기서 편집한 효과는 CDB/Lua 파일에 자동 기록되지 않아.</p></aside>
    </div>
    {saving&&<div className="iw-saving">작업 문서 저장 중...</div>}
  </section>;
}